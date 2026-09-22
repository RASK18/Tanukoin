import type { WebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { db } from "../../data/db";
import { modelByKey, type ChatModel } from "./models";
import {
  getActiveChatModel,
  gpuModelRecord,
  reconcileChatModels,
  uninstallChatFiles,
} from "./model-store";
import { detectHardware, incompatibility } from "./hardware";
import {
  cleanGeneration,
  fitMessages,
  modelError,
  type ChatMessage,
  type Generation,
  type GenerateOptions,
} from "./chat-types";

let worker: Worker | undefined,
  gpu: WebWorkerMLCEngine | undefined,
  loaded: string | undefined;
let epoch = 0;
let sequence: Promise<unknown> = Promise.resolve();
const cancellations = new Set<(error: Error) => void>();
function cancellable<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    cancellations.add(reject);
    promise
      .then(resolve, (error) => reject(modelError(error)))
      .finally(() => cancellations.delete(reject));
  });
}
function serial<T>(task: () => Promise<T>) {
  const ticket = epoch;
  const result = sequence
    .catch(() => {})
    .then(() => {
      if (ticket !== epoch) throw new Error("Operación cancelada");
      return task();
    });
  sequence = result.catch(() => {});
  return result;
}
function dispose() {
  worker?.terminate();
  worker = undefined;
  gpu = undefined;
  loaded = undefined;
  const error = new Error("Operación cancelada");
  for (const reject of cancellations) reject(error);
  cancellations.clear();
}
export function cancelChat() {
  epoch++;
  dispose();
}
async function load(
  model: ChatModel,
  network = false,
  progress?: (p: number) => void,
) {
  if (loaded === model.key) return;
  dispose();
  const ticket = epoch;
  const hardware = await detectHardware();
  const reason = incompatibility(model, hardware);
  if (reason) throw new Error(reason);
  if (ticket !== epoch) throw new Error("Operación cancelada");
  const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
  const record = await gpuModelRecord(model);
  if (
    record.buffer_size_required_bytes &&
    hardware.maxBinding < record.buffer_size_required_bytes
  )
    throw new Error(
      "La GPU no admite el tamaño de búfer requerido por este modelo.",
    );
  if (ticket !== epoch) throw new Error("Operación cancelada");
  worker = new Worker(new URL("./chat.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.postMessage({ tanukoinNetwork: network });
  gpu = await cancellable(
    CreateWebWorkerMLCEngine(
      worker,
      model.modelId,
      {
        appConfig: { model_list: [record], cacheBackend: "cache" },
        initProgressCallback: (p) => progress?.(p.progress),
      },
      { context_window_size: model.contextSize },
    ),
  );
  worker.postMessage({ tanukoinNetwork: false });
  if (ticket !== epoch) throw new Error("Operación cancelada");
  loaded = model.key;
}
async function generate(
  model: ChatModel,
  messages: ChatMessage[],
  options: GenerateOptions = {},
): Promise<Generation> {
  const maxTokens = options.maxTokens ?? 600;
  const request = messages.map((m) => ({ ...m }));
  if (options.schema)
    request[0].content += `\nDevuelve solo JSON válido según este esquema: ${options.schema}`;
  const fitted = fitMessages(request, maxTokens, model.contextSize);
  const start = performance.now();
  // A fresh request contains the complete bounded context; WebLLM must not accumulate hidden history.
  await cancellable(gpu!.resetChat());
  const result = await cancellable(
    gpu!.chat.completions.create({
      messages: fitted,
      temperature: options.temperature ?? 0,
      top_p: options.topP ?? 1,
      max_tokens: maxTokens,
      extra_body: { enable_thinking: false },
      ...(options.schema
        ? {
            response_format: {
              type: "json_object" as const,
              schema: options.schema,
            },
          }
        : {}),
    }),
  );
  const choice = result.choices[0];
  return {
    content: cleanGeneration(
      choice?.message.content || "",
      choice?.finish_reason === "length",
    ),
    promptTokens: result.usage?.prompt_tokens || 0,
    completionTokens: result.usage?.completion_tokens || 0,
    milliseconds: performance.now() - start,
    modelKey: model.key,
  };
}
export function generateChat(
  messages: ChatMessage[],
  options?: GenerateOptions,
): Promise<Generation> {
  return serial(async () => {
    const ticket = epoch;
    const model = await getActiveChatModel();
    if (!model)
      throw new Error("Elige y prepara un modelo vigente en IA local.");
    try {
      if (ticket !== epoch) throw new Error("Operación cancelada");
      await load(model);
    } catch (error) {
      dispose();
      if (ticket !== epoch) throw modelError(error);
      await db.models.update(model.key, {
        ready: false,
        error: modelError(error).message,
      });
      await db.models.update("chat", { ready: false });
      throw modelError(error);
    }
    try {
      if (ticket !== epoch) throw new Error("Operación cancelada");
      return await generate(model, messages, options);
    } catch (error) {
      dispose();
      throw modelError(error);
    }
  });
}
export function prepareChatModel(
  key: string,
  download = false,
  progress?: (p: number) => void,
) {
  return serial(async () => {
    const ticket = epoch;
    const model = modelByKey(key);
    if (!model)
      throw new Error("Este modelo está retirado y no puede utilizarse.");
    await reconcileChatModels();
    if (ticket !== epoch) throw new Error("Operación cancelada");
    const previous = await db.models.get(key);
    const record = await gpuModelRecord(model);
    const state = {
      id: key,
      modelKey: key,
      modelId: model.modelId,
      backend: model.backend,
      engine: model.engine,
      quantization: model.dtype,
      name: model.name,
      revision: model.revision,
      savedAt: new Date().toISOString(),
      ready: false,
      resources: { model: record.model, library: record.model_lib },
    };
    await db.models.put({
      ...state,
      ready: previous?.ready || false,
      preparing: true,
    });
    try {
      if (ticket !== epoch) throw new Error("Operación cancelada");
      dispose();
      await load(model, download, progress);
      dispose();
      await load(model, false);
      const check = await generate(
        model,
        [
          {
            role: "system",
            content: "Devuelve el objeto JSON solicitado sin explicación.",
          },
          { role: "user", content: 'Devuelve {"ready":true}.' },
        ],
        {
          schema:
            '{"type":"object","properties":{"ready":{"type":"boolean"}},"required":["ready"],"additionalProperties":false}',
          maxTokens: 64,
        },
      );
      if (JSON.parse(check.content)?.ready !== true)
        throw new Error(
          "El modelo cargó, pero no superó la comprobación de generación.",
        );
      const hardware = await detectHardware();
      if (ticket !== epoch) throw new Error("Operación cancelada");
      await db.transaction("rw", db.models, async () => {
        const ready = {
          ...state,
          ready: true,
          preparing: false,
          checkedDevice: hardware.device,
        };
        await db.models.put(ready);
        await db.models.put({ ...ready, id: "chat" });
      });
    } catch (error) {
      dispose();
      await db.models.put({
        ...state,
        preparing: false,
        error: modelError(error).message,
      });
      if ((await db.models.get("chat"))?.modelKey === key)
        await db.models.update("chat", { ready: false });
      throw modelError(error);
    }
  });
}
export function removeChatModel(key: string) {
  return serial(async () => {
    if (loaded === key) dispose();
    const state = await db.models.get(key);
    if (state) await uninstallChatFiles(state);
  });
}
export async function completion(
  system: string,
  prompt: string,
  json = false,
  schema?: string,
) {
  const result = await generateChat(
    [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    json
      ? { schema: schema || '{"type":"object","additionalProperties":true}' }
      : undefined,
  );
  if (json) {
    try {
      JSON.parse(result.content);
    } catch {
      throw new Error("El modelo no ha devuelto una consulta válida.");
    }
  }
  return result.content;
}
