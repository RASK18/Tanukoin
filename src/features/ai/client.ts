import { db } from "../../data/db";
import type { Category, Movement } from "../../data/types";
import { normalize } from "../../lib/finance";
import { CHAT_MODEL, EMBEDDING_CACHE, MODEL_REVISION } from "./constants";
import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
let embeddingWorker: Worker | null = null,
  chatWorker: Worker | null = null,
  engine: WebWorkerMLCEngine | null = null;
let chatGeneration = 0;
const chatCancellations = new Set<(error: Error) => void>();
function cancellableChat<T>(task: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    chatCancellations.add(reject);
    task.then(resolve, reject).finally(() => chatCancellations.delete(reject));
  });
}
const pending = new Map<
  string,
  {
    resolve: (r: any) => void;
    reject: (e: Error) => void;
    progress?: (p: number) => void;
  }
>();
function embeddingRequest(
  type: string,
  texts?: string[],
  allowNetwork = false,
  progress?: (p: number) => void,
): Promise<any> {
  if (!embeddingWorker) {
    embeddingWorker = new Worker(
      new URL("./embedding.worker.ts", import.meta.url),
      { type: "module" },
    );
    embeddingWorker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.progress !== undefined) p.progress?.(e.data.progress);
      else {
        pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      }
    };
    embeddingWorker.onerror = () => cancelModel("embeddings");
  }
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    embeddingWorker!.postMessage({ id, type, texts, allowNetwork });
  });
}
export function cancelModel(id: "embeddings" | "chat") {
  if (id === "embeddings") {
    embeddingWorker?.terminate();
    embeddingWorker = null;
    for (const p of pending.values())
      p.reject(new Error("Operación cancelada"));
    pending.clear();
  } else {
    chatGeneration++;
    chatWorker?.terminate();
    chatWorker = null;
    engine = null;
    for (const reject of chatCancellations)
      reject(new Error("Operación cancelada"));
    chatCancellations.clear();
  }
}
export async function gpuAvailable() {
  if (!("gpu" in navigator)) return false;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return (
      !!adapter &&
      adapter.features.has("shader-f16") &&
      adapter.limits.maxStorageBufferBindingSize >= 128 * 1024 * 1024
    );
  } catch {
    return false;
  }
}
async function chatEngine(
  allowNetwork = false,
  onProgress?: (p: number) => void,
) {
  if (engine) return engine;
  const generation = chatGeneration;
  if (!(await gpuAvailable()))
    throw new Error(
      "El chat requiere WebGPU con shader-f16 y memoria suficiente. Puedes usar la búsqueda y los embeddings.",
    );
  const { CreateWebWorkerMLCEngine, prebuiltAppConfig } =
    await import("@mlc-ai/web-llm");
  const record = prebuiltAppConfig.model_list.find(
    (m) => m.model_id === CHAT_MODEL,
  );
  if (!record) throw new Error("Modelo no compatible con esta versión.");
  if (generation !== chatGeneration) throw new Error("Operación cancelada");
  chatWorker = new Worker(new URL("./chat.worker.ts", import.meta.url), {
    type: "module",
  });
  chatWorker.postMessage({ tanukoinNetwork: allowNetwork });
  const loaded = await cancellableChat(
    CreateWebWorkerMLCEngine(
      chatWorker,
      CHAT_MODEL,
      {
        appConfig: { model_list: [record], cacheBackend: "cache" },
        initProgressCallback: (p) => onProgress?.(p.progress),
      },
      { context_window_size: 4096 },
    ),
  );
  if (generation !== chatGeneration) throw new Error("Operación cancelada");
  engine = loaded;
  chatWorker.postMessage({ tanukoinNetwork: false });
  return engine;
}
export async function prepareModel(
  id: "embeddings" | "chat",
  download = false,
  progress?: (p: number) => void,
) {
  await db.models.put({
    id,
    ready: false,
    revision: MODEL_REVISION,
    savedAt: new Date().toISOString(),
  });
  cancelModel(id);
  if (id === "embeddings") {
    await embeddingRequest("init", undefined, download, progress);
    cancelModel(id);
    await embeddingRequest("init");
  } else {
    await chatEngine(download, progress);
    cancelModel(id);
    await chatEngine(false);
  }
  await db.models.put({
    id,
    ready: true,
    revision: MODEL_REVISION,
    savedAt: new Date().toISOString(),
  });
}
export async function removeModel(id: "embeddings" | "chat") {
  cancelModel(id);
  if (id === "embeddings") {
    await caches.delete(EMBEDDING_CACHE);
    await db.embeddings.clear();
  } else {
    const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
    await deleteModelAllInfoInCache(CHAT_MODEL);
  }
  await db.models.delete(id);
}
export async function embed(texts: string[]): Promise<number[][]> {
  if (!(await db.models.get("embeddings"))?.ready)
    throw new Error("Descarga el modelo de embeddings en IA local.");
  return embeddingRequest("embed", texts);
}
export const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
async function vectors(rows: { id: string; text: string }[]) {
  const result: Record<string, number[]> = {};
  const missing: typeof rows = [];
  for (const row of rows) {
    const cached = await db.embeddings.get(row.id);
    if (cached?.text === row.text && cached.model === MODEL_REVISION)
      result[row.id] = cached.vector;
    else missing.push(row);
  }
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16),
      values = await embed(batch.map((r) => r.text));
    for (let j = 0; j < batch.length; j++) {
      result[batch[j].id] = values[j];
      await db.embeddings.put({
        ...batch[j],
        vector: values[j],
        model: MODEL_REVISION,
      });
    }
  }
  return result;
}
export async function categorize(
  movements: Movement[],
  categories: Category[],
  examples: Movement[],
): Promise<Movement[]> {
  if (!(await db.models.get("embeddings"))?.ready || !categories.length)
    return movements;
  const categoryVectors = await vectors(
    categories.map((c) => ({
      id: `category:${c.id}`,
      text: `${c.name}: ${c.description}`,
    })),
  );
  const confirmed = examples
    .filter((m) => m.categorySource === "manual" && m.categoryId)
    .slice(-200);
  const exampleVectors = await vectors(
    confirmed.map((m) => ({
      id: m.id,
      text: `${m.merchant} ${m.description}`,
    })),
  );
  const uncategorized = movements.filter(
    (m) => m.categorySource === "none" || m.categorySource === "ai",
  );
  const movementVectors = await vectors(
    uncategorized.map((m) => ({
      id: m.id,
      text: `${m.merchant} ${m.description}`,
    })),
  );
  return movements.map((m) => {
    if (!movementVectors[m.id]) return m;
    const scores = categories
      .map((c) => ({
        categoryId: c.id,
        score: Math.max(
          cosine(movementVectors[m.id], categoryVectors[`category:${c.id}`]),
          ...confirmed
            .filter((e) => e.categoryId === c.id)
            .map((e) => cosine(movementVectors[m.id], exampleVectors[e.id])),
        ),
      }))
      .sort((a, b) => b.score - a.score);
    const best = scores[0];
    if (best.score >= 0.8 && best.score - (scores[1]?.score || 0) >= 0.1)
      return {
        ...m,
        categoryId: best.categoryId,
        categorySource: "ai",
        aiSuggestion: best,
      };
    return { ...m, aiSuggestion: best.score >= 0.35 ? best : undefined };
  });
}
export async function semanticSearch(query: string, movements: Movement[]) {
  const [q] = await embed([query]);
  const mv = await vectors(
    movements.map((m) => ({
      id: m.id,
      text: `${m.merchant} ${m.description}`,
    })),
  );
  return movements
    .map((m) => ({ movement: m, score: cosine(q, mv[m.id]) }))
    .filter((r) => r.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}
export async function completion(system: string, prompt: string, json = false) {
  if (!(await db.models.get("chat"))?.ready)
    throw new Error("Descarga y comprueba el modelo de chat en IA local.");
  const chat = await chatEngine();
  const response = await cancellableChat(
    chat.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 600,
      extra_body: { enable_thinking: false },
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
    }),
  );
  return response.choices[0]?.message.content || "";
}
