import type { ModelState } from "../../data/types";

export interface ChatModel {
  key: string;
  name: string;
  modelId: string;
  revision: string;
  backend: "wasm" | "webgpu";

  engine: "wllama" | "webllm";

  dtype: "Q4_K_M" | "q4f16_1";

  ggufUrl?: string;

  downloadBytes: number;
  description: string;
  requirements: string;
  contextSize: number;
  minGpuBufferBytes?: number;
  experimental?: boolean;
}

const gpu = (
  size: string,
  vram: number,
  revision: string,
  bytes: number,
  buffer: number,
): ChatModel => ({
  key: `chat:gpu-${size.toLowerCase()}`,
  name: `Qwen3.5 ${size} · GPU ${vram} GB`,

  modelId: `Qwen3.5-${size}-q4f16_1-MLC`,
  revision,
  backend: "webgpu",
  engine: "webllm",
  dtype: "q4f16_1",

  downloadBytes: bytes,
  minGpuBufferBytes: buffer,
  contextSize: 4096,
  experimental: size === "9B",

  description: "MLC q4f16_1 · generación con la tarjeta gráfica.",

  requirements: `Perfil objetivo: ${vram} GB de VRAM. WebGPU y shader-f16; la memoria real depende del equipo y del contexto.`,
});

const cpu = (size: string, revision: string, bytes: number): ChatModel => ({
  key: `chat:cpu-${size.toLowerCase()}`,
  name: `Qwen3.5 ${size} · CPU`,
  modelId: `unsloth/Qwen3.5-${size}-GGUF`,

  revision,
  backend: "wasm",
  engine: "wllama",
  dtype: "Q4_K_M",
  downloadBytes: bytes,
  contextSize: 4096,

  ggufUrl: `https://huggingface.co/unsloth/Qwen3.5-${size}-GGUF/resolve/${revision}/Qwen3.5-${size}-Q4_K_M.gguf`,

  description: "GGUF Q4_K_M · generación con el procesador, sin WebGPU.",

  requirements:
    size === "4B"
      ? "Orientado a 16 GB de RAM. Necesita memoria libre adicional para el contexto y el navegador."
      : "Para equipos más modestos. Necesita varios GB de RAM libres para el modelo y el contexto.",
});

export const CHAT_MODELS: readonly ChatModel[] = [
  gpu(
    "2B",
    4,
    "dd74e9c8a20c4546df85c844103bff87b6dcacad",
    1059315328,
    254279680,
  ),

  gpu(
    "4B",
    8,
    "44b42469f9e192814bfd90440e3b377d89ba7a13",
    2367117312,
    317849600,
  ),

  gpu(
    "9B",
    12,
    "c7c5d3f5a81e37b8facbb72970940a1b131314a8",
    5038040064,
    508559360,
  ),
];
// Metadatos conservados para detectar y desinstalar descargas anteriores.
export const RETIRED_CPU_MODELS: readonly ChatModel[] = [
  cpu("2B", "f6d5376be1edb4d416d56da11e5397a961aca8ae", 1280835840),
  cpu("4B", "e87f176479d0855a907a41277aca2f8ee7a09523", 2740937888),
  cpu("0.8B", "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0", 532517120),
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
