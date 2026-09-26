import { movementDescription } from "../../lib/movement-text";
import { categoryTree } from "../../lib/classification";
import { db } from "../../data/db";
import type { Category, Movement } from "../../data/types";
import { normalize } from "../../lib/finance";
import { EMBEDDING_CACHE, MODEL_REVISION } from "./constants";
import { cancelChat, prepareChatModel, removeChatModel } from "./chat-runtime";
import { getActiveChatModel } from "./model-store";
import { checkWebGPU, incompatibility } from "./webgpu";
import { CHAT_MODELS } from "./models";
export { completion } from "./chat-runtime";
let embeddingWorker: Worker | null = null;
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
  if (id === "chat") {
    cancelChat();
    return;
  }
  embeddingWorker?.terminate();
  embeddingWorker = null;
  for (const p of pending.values()) p.reject(new Error("Operación cancelada"));
  pending.clear();
}
export async function gpuAvailable() {
  return !incompatibility(CHAT_MODELS[1], await checkWebGPU());
}
export async function prepareModel(
  id: "embeddings" | "chat",
  download = false,
  progress?: (p: number) => void,
) {
  if (id === "chat") {
    const model = await getActiveChatModel();
    if (!model) throw new Error("Elige un modelo vigente en IA local.");
    return prepareChatModel(model.key, download, progress);
  }
  await db.models.put({
    id,
    ready: false,
    revision: MODEL_REVISION,
    savedAt: new Date().toISOString(),
  });
  cancelModel(id);
  await embeddingRequest("init", undefined, download, progress);
  cancelModel(id);
  await embeddingRequest("init");
  await db.models.put({
    id,
    ready: true,
    revision: MODEL_REVISION,
    savedAt: new Date().toISOString(),
  });
}
export async function removeModel(id: "embeddings" | "chat") {
  if (id === "chat") {
    const model = await getActiveChatModel();
    if (!model)
      throw new Error(
        "Selecciona el modelo que quieres desinstalar en IA local.",
      );
    return removeChatModel(model.key);
  }
  cancelModel(id);
  await caches.delete(EMBEDDING_CACHE);
  await db.embeddings.clear();
  await db.models.delete(id);
}
export async function embed(texts: string[]): Promise<number[][]> {
  if (!(await db.models.get("embeddings"))?.ready)
    throw new Error("Descarga el modelo de embeddings en IA local.");
  return embeddingRequest("embed", texts);
}
export const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
async function vectors(
  rows: { id: string; text: string }[],
  onProgress?: (done: number, total: number) => void,
) {
  const result: Record<string, number[]> = {};
  const missing: typeof rows = [];
  for (const row of rows) {
    const cached = await db.embeddings.get(row.id);
    if (cached?.text === row.text && cached.model === MODEL_REVISION)
      result[row.id] = cached.vector;
    else missing.push(row);
  }
  onProgress?.(rows.length - missing.length, rows.length);
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
    onProgress?.(
      rows.length - missing.length + Math.min(i + 16, missing.length),
      rows.length,
    );
  }
  return result;
}
export async function categorize(
  movements: Movement[],
  categories: Category[],
  examples: Movement[],
  onProgress?: (done: number, total: number) => void,
): Promise<Movement[]> {
  if (!(await db.models.get("embeddings"))?.ready || !categories.length)
    return movements;
  const tree = categoryTree(categories);
  const categoryVectors = await vectors(
    categories.map((c) => ({
      id: `category:${c.id}`,
      text: `${tree.path(c.id)}: ${c.description}`,
    })),
  );
  const confirmed = examples
    .filter((m) => m.categorySource === "manual" && m.categoryId)
    .slice(-200);
  const exampleVectors = await vectors(
    confirmed.map((m) => ({
      id: m.id,
      text: `${m.merchant} ${movementDescription(m)}`,
    })),
  );
  const uncategorized = movements.filter(
    (m) => m.categorySource === "none" || m.categorySource === "ai",
  );
  const movementVectors = await vectors(
    uncategorized.map((m) => ({
      id: m.id,
      text: `${m.merchant} ${movementDescription(m)}`,
    })),
    onProgress,
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
      text: `${m.merchant} ${movementDescription(m)}`,
    })),
  );
  return movements
    .map((m) => ({ movement: m, score: cosine(q, mv[m.id]) }))
    .filter((r) => r.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}
