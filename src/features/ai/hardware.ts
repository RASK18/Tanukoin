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

  if (model.backend !== "webgpu")
    return "Este modelo CPU está retirado y no puede utilizarse.";

  if (model.backend === "webgpu") {
    if (!hardware.gpu)
      return "WebGPU no está disponible o está bloqueado en este navegador. Tanu no puede funcionar sin WebGPU.";

    if (!hardware.f16)
      return "La GPU no ofrece shader-f16, necesario para los modelos de Tanu.";

    if (
      hardware.maxBinding < (model.minGpuBufferBytes || 128 * 1024 * 1024) ||
      hardware.maxBuffer <
        Math.max(model.minGpuBufferBytes || 0, 256 * 1024 * 1024)
    )
      return "Los límites de WebGPU son insuficientes para este modelo.";
  }
}

export function recommendModel(hardware: Hardware, states: ModelState[]) {
  const model = CHAT_MODELS[1],
    checked = states.find((s) => s.id === model.key);

  const verified =
    !incompatibility(model, hardware) &&
    hardware.device &&
    checked?.ready &&
    checked.revision === model.revision &&
    checked.checkedDevice === hardware.device;

  return {
    key: verified ? model.key : CHAT_MODELS[0].key,
    reason:
      incompatibility(CHAT_MODELS[0], hardware) ||
      (verified
        ? "4B ya superó la comprobación local con esta GPU."
        : "Empieza con 2B. El navegador no permite conocer la VRAM disponible."),
  };
}
