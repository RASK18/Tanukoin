import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import {
  cancelChat,
  completion,
  prepareChatModel,
  removeChatModel,
  generateChat,
} from "../src/features/ai/chat-runtime";
import {
  CHAT_MODELS,
  LEGACY_MODEL_KEY,
  activeChatModel,
  modelCache,
} from "../src/features/ai/models";
import { reconcileChatModels } from "../src/features/ai/model-store";
import {
  recommendModel,
  incompatibility,
  type Hardware,
} from "../src/features/ai/hardware";

const {
  create,
  load,
  postMessage,
  terminate,
  deleteModel,
  deleteConfig,
  deleteWasm,
} = vi.hoisted(() => ({
  create: vi.fn(),
  load: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn(),
  deleteModel: vi.fn(),
  deleteConfig: vi.fn(),
  deleteWasm: vi.fn(),
}));
vi.mock("@mlc-ai/web-llm", () => ({
  prebuiltAppConfig: {
    model_list: [
      "Qwen3-1.7B-q4f16_1-MLC",
      "Qwen3-4B-q4f16_1-MLC",
      "Qwen3-8B-q4f16_1-MLC",
      "Qwen3.5-4B-q4f16_1-MLC",
    ].map((model_id) => ({
      model_id,
      model: `https://example.test/${model_id}`,
      model_lib: `${model_id}.wasm`,
    })),
  },
  CreateWebWorkerMLCEngine: load,
  deleteModelInCache: deleteModel,
  deleteChatConfigInCache: deleteConfig,
  deleteModelWasmInCache: deleteWasm,
}));
const balanced = CHAT_MODELS[1],
  advanced = CHAT_MODELS[2];
const hardware: Hardware = {
  wasm: true,
  gpu: true,
  f16: true,
  maxBuffer: 1e9,
  maxBinding: 1e9,
  ramGB: 8,
  device: "ficticia",
};
const state = (model = balanced) => ({
  id: model.key,
  modelKey: model.key,
  modelId: model.modelId,
  backend: model.backend,
  ready: true,
  revision: model.revision,
  savedAt: "2026-09-21",
});
function response(content: string, finish_reason = "stop") {
  return { choices: [{ message: { content }, finish_reason }] };
}
beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.models.bulkPut([state(), { ...state(), id: "chat" }]);
  vi.stubGlobal("navigator", {
    gpu: {
      requestAdapter: async () => ({
        info: { vendor: "ficticia" },
        features: new Set(["shader-f16"]),
        limits: { maxStorageBufferBindingSize: 1e9, maxBufferSize: 1e9 },
      }),
    },
  });
  vi.stubGlobal(
    "Worker",
    class {
      postMessage = postMessage;
      terminate = terminate;
    },
  );
  load.mockResolvedValue({
    resetChat: vi.fn().mockResolvedValue(undefined),
    chat: { completions: { create } },
  });
  create.mockResolvedValue(response('{"ready":true}'));
});
afterEach(() => {
  cancelChat();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("rechaza el modelo retirado sin cargarlo y conserva sus registros", async () => {
  await db.models.clear();
  await db.models.put({
    id: "chat",
    ready: true,
    revision: "tanukoin-models-1",
    savedAt: "2026-09-21",
  });
  await reconcileChatModels();
  expect((await db.models.get(LEGACY_MODEL_KEY))?.ready).toBe(false);
  expect(activeChatModel(await db.models.toArray())).toBeUndefined();
  await expect(completion("s", "q")).rejects.toThrow("vigente");
  await expect(prepareChatModel(LEGACY_MODEL_KEY)).rejects.toThrow("retirado");
  expect(load).not.toHaveBeenCalled();
  expect(deleteModel).not.toHaveBeenCalled();
});
it("activa solo tras reiniciar y verificar generación offline", async () => {
  await prepareChatModel(advanced.key, true);
  expect(load).toHaveBeenCalledTimes(2);
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(postMessage.mock.calls.map(([m]) => m.tanukoinNetwork)).toEqual([
    true,
    false,
    false,
    false,
  ]);
  expect(activeChatModel(await db.models.toArray())?.key).toBe(advanced.key);
  expect((await db.models.get(balanced.key))?.ready).toBe(true);
  expect(load.mock.calls[0][3]).toEqual({ context_window_size: 4096 });
});
it("la prueba Qwen3.5 conserva los modelos descargados y el muestreo se limita a conversación", async () => {
  await prepareChatModel("chat:balanced-trial", true);
  expect((await db.models.get(balanced.key))?.ready).toBe(true);
  expect(activeChatModel(await db.models.toArray())?.key).toBe(
    "chat:balanced-trial",
  );
  await generateChat([{ role: "user", content: "Hola" }], {
    temperature: 0.7,
    topP: 0.8,
  });
  expect(create.mock.calls.at(-1)?.[0]).toMatchObject({
    temperature: 0.7,
    top_p: 0.8,
  });
  await completion("Interpreta una consulta", "Máximo", true);
  expect(create.mock.calls.at(-1)?.[0]).toMatchObject({
    temperature: 0,
    top_p: 1,
  });
});
it("retira una revisión antigua conservando sus recursos exclusivos", async () => {
  const old = {
    ...state(CHAT_MODELS[0]),
    revision: "old-revision",
    resources: { cache: "tanukoin-chat-light-old-revision" },
  };
  await db.models.bulkPut([old, { ...old, id: "chat" }]);
  await reconcileChatModels();
  expect(activeChatModel(await db.models.toArray())).toBeUndefined();
  expect(await db.models.get(CHAT_MODELS[0].key)).toBeUndefined();
  expect(
    await db.models.get(`${CHAT_MODELS[0].key}@old-revision`),
  ).toMatchObject({ ready: false, resources: old.resources });
  expect(deleteModel).not.toHaveBeenCalled();
});
it("mantiene el modelo vigente anterior cuando la nueva instalación falla", async () => {
  create.mockRejectedValue("Sin memoria GPU");
  await expect(prepareChatModel(advanced.key, true)).rejects.toThrow(
    "Sin memoria GPU",
  );
  expect(activeChatModel(await db.models.toArray())?.key).toBe(balanced.key);
  expect((await db.models.get(advanced.key))?.ready).toBe(false);
});
it("cambia a uno instalado sin red y libera el anterior", async () => {
  await completion("s", "q");
  await prepareChatModel(advanced.key, false);
  expect(
    postMessage.mock.calls.every(([m]) => m.tanukoinNetwork === false),
  ).toBe(true);
  expect(terminate).toHaveBeenCalledTimes(2);
});
it("desinstala solo recursos de la variante elegida", async () => {
  const cacheDelete = vi.fn();
  const old = "https://example.test/Qwen3-1.7B-q4f16_1-MLC/part.bin";
  const current = `https://example.test/${balanced.modelId}/part.bin`;
  const entries = new Set([old, current]);
  const fileDelete = vi.fn(async (request: Request) =>
    entries.delete(request.url),
  );
  vi.stubGlobal("caches", {
    delete: cacheDelete,
    keys: async () => ["shared"],
    open: async () => ({
      keys: async () => [...entries].map((url) => new Request(url)),
      delete: fileDelete,
    }),
  });
  await db.models.put(state(CHAT_MODELS[0]));
  await removeChatModel(CHAT_MODELS[0].key);
  expect(cacheDelete).toHaveBeenCalledWith(modelCache(CHAT_MODELS[0]));
  expect((await db.models.get(balanced.key))?.ready).toBe(true);
  expect(deleteModel).not.toHaveBeenCalled();
  await db.models.put({
    id: LEGACY_MODEL_KEY,
    modelId: "Qwen3-1.7B-q4f16_1-MLC",
    backend: "webgpu",
    ready: false,
    revision: "old",
    savedAt: "",
  });
  await removeChatModel(LEGACY_MODEL_KEY);
  expect(entries.has(old)).toBe(false);
  expect(entries.has(current)).toBe(true);
  expect(deleteModel).not.toHaveBeenCalled();
  expect((await db.models.get(balanced.key))?.ready).toBe(true);
});
it.each([
  ["", "stop"],
  ['{"op":', "length"],
  ["No es JSON", "stop"],
  ['<think>razonamiento</think>{"op":"sum"}', "stop"],
])("rechaza respuestas inválidas: %s", async (content, finish) => {
  create.mockResolvedValue(response(content, finish));
  await expect(completion("s", "q", true)).rejects.toThrow();
});
it("limpia el prefijo vacío y serializa generaciones del importador y el chat", async () => {
  let concurrent = 0;
  create.mockImplementation(async () => {
    expect(++concurrent).toBe(1);
    await Promise.resolve();
    concurrent--;
    return response('<think>\n</think>{"ok":true}');
  });
  expect(
    await Promise.all([completion("s", "q", true), completion("s", "q", true)]),
  ).toEqual(['{"ok":true}', '{"ok":true}']);
  expect(load).toHaveBeenCalledOnce();
});
it("cancelar impide una activación tardía y permite volver a generar", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const preparation = prepareChatModel(advanced.key);
  const rejected = expect(preparation).rejects.toThrow("cancelada");
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  cancelChat();
  await rejected;
  finish(response('{"ready":true}'));
  expect(activeChatModel(await db.models.toArray())?.key).toBe(balanced.key);
  expect(await completion("s", "q", true)).toBe('{"ready":true}');
});
it("cancelar durante la carga conserva la instalación y permite reintentarlo", async () => {
  load.mockImplementationOnce(() => new Promise(() => {}));
  const request = completion("s", "q", true);
  const rejected = expect(request).rejects.toThrow("cancelada");
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  cancelChat();
  await rejected;
  expect(activeChatModel(await db.models.toArray())?.key).toBe(balanced.key);
  expect(await completion("s", "q", true)).toBe('{"ready":true}');
});
it("recomienda según compatibilidad y RAM, avanzado solo tras comprobar esa GPU", () => {
  expect(recommendModel({ ...hardware, gpu: false }, []).key).toBe(
    "chat:light",
  );
  expect(recommendModel({ ...hardware, f16: false }, []).key).toBe(
    "chat:light",
  );
  expect(recommendModel({ ...hardware, ramGB: undefined }, []).key).toBe(
    "chat:light",
  );
  expect(recommendModel(hardware, []).key).toBe("chat:balanced");
  expect(recommendModel({ ...hardware, cpuThreads: 2 }, []).key).toBe(
    "chat:light",
  );
  expect(
    recommendModel({ ...hardware, cpuThreads: 6, deviceType: "desktop" }, [])
      .key,
  ).toBe("chat:balanced");
  expect(
    recommendModel({ ...hardware, cpuThreads: 8, deviceType: "mobile" }, [])
      .key,
  ).toBe("chat:light");
  expect(recommendModel({ ...hardware, ramGB: 4 }, []).key).toBe("chat:light");
  // Profile recommendations never prevent a manual choice of compatible GPU models.
  expect(
    incompatibility(balanced, {
      ...hardware,
      cpuThreads: 2,
      deviceType: "mobile",
    }),
  ).toBeUndefined();
  expect(
    recommendModel(hardware, [
      { ...state(advanced), checkedDevice: hardware.device },
    ]).key,
  ).toBe("chat:advanced");
  expect(
    recommendModel(hardware, [{ ...state(advanced), checkedDevice: "otra" }])
      .key,
  ).toBe("chat:balanced");
  expect(
    incompatibility(advanced, { ...hardware, maxBinding: 100 }),
  ).toBeTruthy();
  const limited = { ...hardware, maxBinding: 256 * 1024 * 1024 };
  expect(incompatibility(balanced, limited)).toBeUndefined();
  expect(incompatibility(advanced, limited)).toBeTruthy();
  expect(
    recommendModel({ ...hardware, maxBinding: 128 * 1024 * 1024 }, []).key,
  ).toBe("chat:light");
  expect(
    incompatibility(CHAT_MODELS[0], { ...hardware, gpu: false, f16: false }),
  ).toBeUndefined();
});
