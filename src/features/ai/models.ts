import type { ModelState } from "../../data/types";

export interface ChatModel {
  key: string;
  name: string;
  modelId: string;
  revision: string;
  backend: "wasm" | "webgpu";
  dtype: "q8" | "q4f16_1";
  downloadBytes: number;
  description: string;
  requirements: string;
  contextSize: number;
  minGpuBufferBytes?: number;
  experimental?: boolean;
}

export const CHAT_MODELS: readonly ChatModel[] = [
  {
    key: "chat:light",
    name: "Ligero",
    modelId: "onnx-community/Qwen3-1.7B-ONNX",
    revision: "cc6a06a21d614e9b8e92a6adfab1074d4e7d2438",
    backend: "wasm",
    dtype: "q8",
    downloadBytes: 1_760_000_000,
    contextSize: 4096,
    description:
      "Qwen3 1.7B · 8 bits. Funciona sin tarjeta gráfica compatible; responde más despacio.",
    requirements:
      "CPU y WebAssembly. Necesita varios GB de RAM libres; la preparación comprobará la carga.",
  },
  {
    key: "chat:balanced",
    name: "Equilibrado",
    modelId: "Qwen3-4B-q4f16_1-MLC",
    revision: "a5c9fab855e3ccbdfed2e7e69683d75f30332161",
    backend: "webgpu",
    dtype: "q4f16_1",
    downloadBytes: 2_500_000_000,
    // Largest tensor in this pinned revision's tensor-cache.json.
    minGpuBufferBytes: 194_478_080,
    contextSize: 4096,
    description:
      "Qwen3 4B · 4 bits. Equilibrio entre capacidad y consumo de memoria.",
    requirements:
      "WebGPU y shader-f16. Memoria gráfica estimada: 3,4 GB, más margen para el navegador.",
  },
  {
    key: "chat:advanced",
    name: "Avanzado",
    modelId: "Qwen3-8B-q4f16_1-MLC",
    revision: "b3d55c289eae58f77095f5b68c895eeea358ee09",
    backend: "webgpu",
    dtype: "q4f16_1",
    downloadBytes: 4_800_000_000,
    minGpuBufferBytes: 311_164_928,
    contextSize: 4096,
    description:
      "Qwen3 8B · 4 bits. Mayor capacidad de interpretación, con más consumo de memoria.",
    requirements:
      "GPU de 8 GB de VRAM, WebGPU y shader-f16. Estimación del modelo: 5,7 GB; contexto de 4096 tokens.",
  },
  {
    key: "chat:balanced-trial",
    name: "Qwen3.5 · prueba",
    modelId: "Qwen3.5-4B-q4f16_1-MLC",
    revision: "44b42469f9e192814bfd90440e3b377d89ba7a13",
    backend: "webgpu",
    dtype: "q4f16_1",
    downloadBytes: 2_367_117_312,
    contextSize: 4096,
    minGpuBufferBytes: 317_849_600,
    experimental: true,
    description:
      "Qwen3.5 4B · 4 bits. Alternativa en evaluación para mejorar la conversación con menos memoria que Avanzado.",
    requirements:
      "WebGPU y shader-f16. Memoria gráfica estimada: 3,9 GB, más margen para el navegador.",
  },
];
export const RETIRED_CHAT_MODEL = "Qwen3-1.7B-q4f16_1-MLC";
export const LEGACY_MODEL_KEY = "retired:Qwen3-1.7B-q4f16_1-MLC";
export const modelByKey = (key?: string) =>
  CHAT_MODELS.find((m) => m.key === key);
export const modelCache = (model: ChatModel) =>
  `tanukoin-${model.key.replace(":", "-")}-${model.revision}`;
export function activeChatModel(states: ModelState[]) {
  const active = states.find((s) => s.id === "chat");
  const model = modelByKey(active?.modelKey);
  const installed = states.find((s) => s.id === model?.key);
  return model &&
    active?.ready &&
    active.revision === model.revision &&
    installed?.ready &&
    installed.revision === model.revision
    ? model
    : undefined;
}
export function retiredModels(states: ModelState[]) {
  return states.filter(
    (s) => s.id !== "embeddings" && s.id !== "chat" && !modelByKey(s.id),
  );
}
