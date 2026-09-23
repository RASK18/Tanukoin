import type { ChatModel } from "./models";

export interface WebGPUCapabilities {
  gpu: boolean;
  f16: boolean;
  maxBuffer: number;
  maxBinding: number;
}
export async function checkWebGPU(): Promise<WebGPUCapabilities> {
  let adapter: any;
  try {
    adapter = await (navigator as any).gpu?.requestAdapter({
      powerPreference: "high-performance",
    });
  } catch {
    /* Optional API. */
  }
  const info = adapter?.info;
  return {
    gpu: !!adapter && !info?.isFallbackAdapter && !adapter?.isFallbackAdapter,
    f16: !!adapter?.features.has("shader-f16"),
    maxBuffer: adapter?.limits.maxBufferSize || 0,
    maxBinding: adapter?.limits.maxStorageBufferBindingSize || 0,
  };
}
export function incompatibility(
  model: ChatModel,
  webgpu: WebGPUCapabilities,
): string | undefined {
  if (model.backend !== "webgpu")
    return "Este modelo CPU está retirado y no puede utilizarse.";

  if (model.backend === "webgpu") {
    if (!webgpu.gpu)
      return "WebGPU no está disponible o está bloqueado en este navegador. Tanu no puede funcionar sin WebGPU.";

    if (!webgpu.f16)
      return "La GPU no ofrece shader-f16, necesario para los modelos de Tanu.";

    if (
      webgpu.maxBinding < (model.minGpuBufferBytes || 128 * 1024 * 1024) ||
      webgpu.maxBuffer <
        Math.max(model.minGpuBufferBytes || 0, 256 * 1024 * 1024)
    )
      return "Los límites de WebGPU son insuficientes para este modelo.";
  }
}
