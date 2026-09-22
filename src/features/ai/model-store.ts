import { db } from "../../data/db";
import type { ModelState } from "../../data/types";
import {
  activeChatModel,
  LEGACY_MODEL_KEY,
  modelByKey,
  modelCache,
  RETIRED_CHAT_MODEL,
  type ChatModel,
} from "./models";

export async function reconcileChatModels() {
  await db.transaction("rw", db.models, async () => {
    const active = await db.models.get("chat");
    if (active && !modelByKey(active.modelKey)) {
      const key = active.modelKey || LEGACY_MODEL_KEY;
      if (!(await db.models.get(key)))
        await db.models.put({
          ...active,
          id: key,
          modelKey: key,
          ready: false,
          preparing: false,
          modelId: active.modelId || RETIRED_CHAT_MODEL,
          backend: active.backend || "webgpu",
          name: active.name || "Qwen3 1.7B GPU · 4 bits",
        });
      await db.models.delete("chat");
    }
    for (const state of await db.models.toArray()) {
      const current = modelByKey(state.id);
      if (current && state.revision !== current.revision) {
        const key = `${state.id}@${state.revision}`;
        await db.models.put({
          ...state,
          id: key,
          modelKey: key,
          modelId: state.modelId || current.modelId,
          backend: state.backend || current.backend,
          name: `${current.name} · revisión anterior`,
          ready: false,
          preparing: false,
          resources:
            state.resources ||
            (current.backend === "wasm"
              ? { cache: modelCache({ ...current, revision: state.revision }) }
              : undefined),
        });
        await db.models.delete(state.id);
        if (active?.modelKey === state.id) await db.models.delete("chat");
        continue;
      }
      if (state.preparing) {
        await db.models.update(state.id, {
          preparing: false,
          ready: false,
          error:
            "La preparación se interrumpió. Comprueba los archivos sin conexión o reanuda la descarga.",
        });
        if (active?.modelKey === state.id)
          await db.models.update("chat", { ready: false, preparing: false });
      }
      if (
        state.id !== "embeddings" &&
        state.id !== "chat" &&
        !modelByKey(state.id) &&
        state.ready
      )
        await db.models.update(state.id, { ready: false, preparing: false });
    }
  });
}
export async function getActiveChatModel() {
  return activeChatModel(await db.models.toArray());
}
export async function gpuModelRecord(model: ChatModel) {
  const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");
  const original = prebuiltAppConfig.model_list.find(
    (m) => m.model_id === model.modelId,
  );
  if (!original) throw new Error("Modelo no compatible con esta versión.");
  return {
    ...original,
    model: `https://huggingface.co/mlc-ai/${model.modelId}/resolve/${model.revision}/`,
  };
}
export async function uninstallChatFiles(state: ModelState) {
  const model = modelByKey(state.id);
  if (model?.backend === "wasm" || state.backend === "wasm") {
    const cache =
      state.resources?.cache ||
      (model && modelCache({ ...model, revision: state.revision }));
    if (!cache?.startsWith("tanukoin-chat-"))
      throw new Error("No se reconoce la caché exclusiva de este modelo.");
    const shared = (await db.models.toArray()).some(
      (s) =>
        s.id !== state.id && s.id !== "chat" && s.resources?.cache === cache,
    );
    if (!shared) await caches.delete(cache);
  } else if (
    state.backend === "webgpu" ||
    model?.backend === "webgpu" ||
    state.id === LEGACY_MODEL_KEY
  ) {
    const { prebuiltAppConfig } = await import("@mlc-ai/web-llm");
    const record =
      state.modelId && state.resources?.model && state.resources.library
        ? {
            model_id: state.modelId,
            model: state.resources.model,
            model_lib: state.resources.library,
          }
        : model
          ? await gpuModelRecord({ ...model, revision: state.revision })
          : prebuiltAppConfig.model_list.find(
              (m) => m.model_id === state.modelId,
            );
    if (!record)
      throw new Error(
        "No se reconoce la caché de este modelo; no se ha eliminado ningún archivo.",
      );
    const otherStates = (await db.models.toArray()).filter(
      (s) => s.id !== state.id && s.id !== "chat",
    );
    const shared = otherStates.some((s) => {
      const id = modelByKey(s.id)?.modelId || s.modelId;
      return (
        (s.resources?.library ||
          prebuiltAppConfig.model_list.find((r) => r.model_id === id)
            ?.model_lib) === record.model_lib
      );
    });
    const prefix = record.model.replace(/\/?$/, "/");
    const modelShared = otherStates.some(
      (s) => s.resources?.model?.replace(/\/?$/, "/") === prefix,
    );
    // WebLLM's deletion helper may fetch missing metadata. Enumerate local keys
    // instead, including partial downloads, without network or shared-cache deletion.
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        if (
          (!modelShared && request.url.startsWith(prefix)) ||
          (!shared && request.url === record.model_lib)
        )
          await cache.delete(request);
      }
    }
  } else {
    throw new Error(
      "No se reconoce la caché de este modelo; se conserva para evitar borrar otros recursos.",
    );
  }
  await db.transaction("rw", db.models, async () => {
    if ((await db.models.get("chat"))?.modelKey === state.id)
      await db.models.delete("chat");
    await db.models.delete(state.id);
  });
}

// Read metadata only: reading multi-GB response bodies just to show their size would exhaust RAM.
export async function cachedModelSize(
  state: ModelState,
): Promise<number | undefined> {
  if (typeof caches === "undefined") return;
  const model = modelByKey(state.id);
  const id = model?.modelId || state.modelId;
  if (!id) return;
  const cacheName =
    state.resources?.cache ||
    (model?.backend === "wasm"
      ? modelCache({ ...model, revision: state.revision })
      : undefined);
  const resourcePrefix = state.resources?.model?.replace(/\/?$/, "/");
  let bytes = 0,
    found = false,
    unknown = false;
  for (const name of await caches.keys()) {
    if (cacheName && name !== cacheName) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      if (
        resourcePrefix &&
        !request.url.startsWith(resourcePrefix) &&
        request.url !== state.resources?.library
      )
        continue;
      if (
        !cacheName &&
        !resourcePrefix &&
        !path.includes(`/${id}/`) &&
        !path.includes(`/${id.split("/").at(-1)}/`) &&
        !path.endsWith(`/${id}_cs1k-webgpu.wasm`)
      )
        continue;
      found = true;
      const size = Number(
        (await cache.match(request))?.headers.get("content-length"),
      );
      if (size > 0) bytes += size;
      else unknown = true;
    }
  }
  return found && !unknown ? bytes : undefined;
}
