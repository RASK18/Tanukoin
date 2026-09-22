import type { ModelState } from "../../data/types";
import { CHAT_MODELS, type ChatModel } from "./models";

export interface Hardware {
  wasm: boolean;
  gpu: boolean;
  f16: boolean;
  maxBuffer: number;
  maxBinding: number;
  ramGB?: number;
  cpuThreads?: number;
  deviceType?: "desktop" | "mobile";
  device: string;
}
export async function detectHardware(): Promise<Hardware> {
  let adapter: any;
  try {
    adapter = await (navigator as any).gpu?.requestAdapter({
      powerPreference: "high-performance",
    });
  } catch {
    /* Optional API. */
  }
  const browser = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(browser.userAgent) ||
    (/Macintosh/i.test(browser.userAgent) && browser.maxTouchPoints > 1);
  const deviceType =
    mobile || browser.userAgentData?.mobile === true
      ? "mobile"
      : browser.userAgentData?.mobile === false ||
          /Windows|Macintosh|X11|CrOS/i.test(browser.userAgent)
        ? "desktop"
        : undefined;
  const info = adapter?.info;
  return {
    wasm: typeof WebAssembly !== "undefined",
    gpu: !!adapter && !info?.isFallbackAdapter && !adapter?.isFallbackAdapter,
    f16: !!adapter?.features.has("shader-f16"),
    maxBuffer: adapter?.limits.maxBufferSize || 0,
    maxBinding: adapter?.limits.maxStorageBufferBindingSize || 0,
    ramGB:
      Number.isFinite(browser.deviceMemory) && browser.deviceMemory! > 0
        ? browser.deviceMemory
        : undefined,
    cpuThreads:
      Number.isInteger(browser.hardwareConcurrency) &&
      browser.hardwareConcurrency > 0
        ? browser.hardwareConcurrency
        : undefined,
    deviceType,
    device: [info?.vendor, info?.architecture, info?.device, info?.description]
      .filter(Boolean)
      .join(" / "),
  };
}
export function incompatibility(
  model: ChatModel,
  hardware: Hardware,
): string | undefined {
  if (!hardware.wasm) return "Este navegador no ofrece WebAssembly.";
  if (model.backend === "webgpu") {
    if (!hardware.gpu)
      return "Este navegador no ofrece una GPU compatible. Puedes usar Ligero con CPU.";
    if (!hardware.f16)
      return "La GPU no ofrece shader-f16. Puedes usar Ligero con CPU.";
    if (
      hardware.maxBinding < (model.minGpuBufferBytes || 128 * 1024 * 1024) ||
      hardware.maxBuffer <
        Math.max(model.minGpuBufferBytes || 0, 256 * 1024 * 1024)
    )
      return "Los límites de WebGPU son insuficientes para este modelo.";
  }
}
export function recommendModel(hardware: Hardware, states: ModelState[]) {
  if (!hardware.wasm)
    return {
      key: CHAT_MODELS[0].key,
      reason:
        "Este navegador no admite WebAssembly. Usa un navegador compatible para preparar un modelo.",
    };
  const advanced = CHAT_MODELS[2];
  const checked = states.find((s) => s.id === advanced.key);
  if (
    !incompatibility(advanced, hardware) &&
    hardware.device &&
    checked?.ready &&
    checked.revision === advanced.revision &&
    checked.checkedDevice === hardware.device
  )
    return {
      key: advanced.key,
      reason: "Avanzado ya superó la comprobación local con esta GPU.",
    };
  const gpuProblem = incompatibility(CHAT_MODELS[1], hardware);
  if (gpuProblem) return { key: CHAT_MODELS[0].key, reason: gpuProblem };
  if (hardware.deviceType === "mobile")
    return {
      key: CHAT_MODELS[0].key,
      reason:
        "En móvil o tableta recomendamos empezar con menor consumo. Puedes elegir otro modelo compatible.",
    };
  if (hardware.cpuThreads !== undefined && hardware.cpuThreads < 4)
    return {
      key: CHAT_MODELS[0].key,
      reason:
        "El navegador indica pocos núcleos lógicos; recomendamos empezar con Ligero. Es orientativo y puedes elegir otro modelo compatible.",
    };
  if ((hardware.ramGB || 0) >= 8)
    return {
      key: CHAT_MODELS[1].key,
      reason:
        "WebGPU compatible y al menos 8 GB de RAM aproximada. La carga comprobará la memoria gráfica disponible.",
    };
  return {
    key: CHAT_MODELS[0].key,
    reason:
      hardware.ramGB === undefined
        ? "El navegador no indica la RAM; recomendamos empezar con Ligero. Puedes elegir otro modelo compatible."
        : "La RAM aproximada es inferior a 8 GB; recomendamos empezar con Ligero. Puedes elegir otro modelo compatible.",
  };
}
