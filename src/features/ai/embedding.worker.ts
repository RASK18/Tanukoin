import { pipeline, env } from "@huggingface/transformers";
import {
  EMBEDDING_MODEL,
  EMBEDDING_REVISION,
  EMBEDDING_CACHE,
} from "./constants";
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.wasmPaths = `${self.location.origin}${import.meta.env.BASE_URL}onnx/`;
type Extractor = (
  text: string | string[],
  options: { pooling: string; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;
const createExtractor = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<Extractor>;
let extractor: Extractor | null = null;
let network = false;
const nativeFetch = self.fetch.bind(self);
self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    self.location.href,
  );
  if (url.origin !== self.location.origin && !network)
    return Promise.reject(
      new Error("El modelo no está completo en caché. Descárgalo en IA local."),
    );
  return nativeFetch(input, init);
}) as typeof fetch;
let sequence = Promise.resolve();
self.onmessage = (
  event: MessageEvent<{
    id: string;
    type: string;
    texts?: string[];
    allowNetwork?: boolean;
  }>,
) => {
  sequence = sequence.then(async () => {
    const { id, type, texts, allowNetwork } = event.data;
    try {
      network = allowNetwork === true;
      env.customCache = await caches.open(EMBEDDING_CACHE);
      if (!extractor)
        extractor = await createExtractor(
          "feature-extraction",
          EMBEDDING_MODEL,
          {
            dtype: "q8",
            device: "wasm",
            revision: EMBEDDING_REVISION,
            progress_callback: (p: Record<string, unknown>) => {
              if ("progress" in p)
                self.postMessage({ id, progress: Number(p.progress) / 100 });
            },
          },
        );
      if (type === "embed") {
        const output = await extractor(texts || [], {
          pooling: "mean",
          normalize: true,
        });
        self.postMessage({ id, result: output.tolist() });
      } else {
        await extractor("comprobación local", {
          pooling: "mean",
          normalize: true,
        });
        self.postMessage({ id, result: true });
      }
      network = false;
    } catch (e) {
      network = false;
      self.postMessage({
        id,
        error: e instanceof Error ? e.message : "No se pudo cargar el modelo",
      });
    }
  });
};
