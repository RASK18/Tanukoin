import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import {
  CHAT_MODELS,
  RETIRED_CPU_MODELS,
  modelByKey,
  retiredModels,
  activeChatModel,
} from "../src/features/ai/models";
import {
  discoverCpuDownloads,
  uninstallChatFiles,
  reconcileChatModels,
} from "../src/features/ai/model-store";

const cache = vi.hoisted(() => ({ open: vi.fn(), delete: vi.fn() }));
vi.mock("@wllama/wllama", () => ({
  CacheManager: class {
    open = cache.open;
    delete = cache.delete;
  },
}));
beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.stubGlobal("navigator", { storage: { getDirectory: vi.fn() } });
});
it("conserva la URL de una revisión GGUF antigua al retirarla", async () => {
  const model = RETIRED_CPU_MODELS[2];
  await db.models.put({
    id: model.key,
    modelKey: model.key,
    ready: true,
    revision: "anterior",
    savedAt: "",
  });
  await reconcileChatModels();
  expect(await db.models.get(model.key)).toMatchObject({
    ready: false,
    resources: { gguf: model.ggufUrl!.replace(model.revision, "anterior") },
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("detecta el GGUF 0.8B sin acreditarlo como listo", async () => {
  const model = RETIRED_CPU_MODELS[2];
  cache.open.mockImplementation(async (url) =>
    url === model.ggufUrl ? { size: model.downloadBytes } : null,
  );
  await discoverCpuDownloads();
  expect(await db.models.get(model.key)).toMatchObject({
    ready: false,
    resources: { gguf: model.ggufUrl },
    engine: "wllama",
    quantization: "Q4_K_M",
  });
  expect(await db.models.get("chat")).toBeUndefined();
  await db.models.update(model.key, { ready: true });
  await discoverCpuDownloads();
  await reconcileChatModels();
  expect((await db.models.get(model.key))?.ready).toBe(false);
  expect(activeChatModel(await db.models.toArray())).toBeUndefined();
});
it("no ofrece un GGUF parcial y no elimina archivos compartidos", async () => {
  cache.open.mockResolvedValue({ size: 1 });
  await discoverCpuDownloads();
  expect(await db.models.count()).toBe(0);
  const state = {
    id: RETIRED_CPU_MODELS[2].key,
    revision: RETIRED_CPU_MODELS[2].revision,
    savedAt: "",
    ready: false,
    resources: { gguf: RETIRED_CPU_MODELS[2].ggufUrl },
  };
  await db.models.bulkPut([state, { ...state, id: "retired:shared" }]);
  await uninstallChatFiles(state);
  expect(cache.delete).not.toHaveBeenCalled();
  await uninstallChatFiles({ ...state, id: "retired:shared" });
  expect(cache.delete).toHaveBeenCalledWith(state.resources.gguf);
});
it("retira 0.8B, 2B y 4B CPU conservando las descargas y sus recursos de desinstalación", async () => {
  for (const model of RETIRED_CPU_MODELS) {
    expect(modelByKey(model.key)).toBeUndefined();
    await db.models.put({
      id: model.key,
      modelKey: model.key,
      revision: model.revision,
      ready: true,
      savedAt: "",
    });
  }
  const model = RETIRED_CPU_MODELS[1];
  await db.models.put({
    id: "chat",
    modelKey: model.key,
    revision: model.revision,
    ready: true,
    savedAt: "",
  });
  await reconcileChatModels();
  const states = await db.models.toArray();
  expect(activeChatModel(states)).toBeUndefined();
  expect(retiredModels(states)).toHaveLength(3);
  expect(await db.models.get(model.key)).toMatchObject({
    ready: false,
    resources: { gguf: model.ggufUrl },
  });
  expect(cache.delete).not.toHaveBeenCalled();
});

it("detecta el GGUF 4B de la antigua prueba como retirado sin borrarlo", async () => {
  const model = RETIRED_CPU_MODELS[1];
  cache.open.mockImplementation(async (url) =>
    url === model.ggufUrl ? { size: model.downloadBytes } : null,
  );
  await discoverCpuDownloads();
  expect(retiredModels(await db.models.toArray())).toMatchObject([
    { id: model.key, ready: false, resources: { gguf: model.ggufUrl } },
  ]);
  expect(cache.delete).not.toHaveBeenCalled();
});

it("desinstala CPU 2B/4B retirados sin cambiar la instalación ni selección GPU 2B/4B", async () => {
  for (let i = 0; i < 2; i++) {
    const gpu = CHAT_MODELS[i],
      cpu = RETIRED_CPU_MODELS[i];
    const gpuState = {
      id: gpu.key,
      modelKey: gpu.key,
      revision: gpu.revision,
      ready: true,
      savedAt: "",
      resources: { model: `https://example.test/${gpu.key}/` },
    };
    const cpuState = {
      id: cpu.key,
      modelKey: cpu.key,
      revision: cpu.revision,
      ready: true,
      savedAt: "",
      resources: { gguf: cpu.ggufUrl },
    };
    await db.models.bulkPut([gpuState, { ...gpuState, id: "chat" }, cpuState]);
    await reconcileChatModels();
    expect(activeChatModel(await db.models.toArray())?.key).toBe(gpu.key);
    await uninstallChatFiles((await db.models.get(cpu.key))!);
    expect(cache.delete).toHaveBeenLastCalledWith(cpu.ggufUrl);
    expect(await db.models.get(gpu.key)).toEqual(gpuState);
    expect(activeChatModel(await db.models.toArray())?.key).toBe(gpu.key);
  }
});
