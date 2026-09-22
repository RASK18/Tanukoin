import {
  AutoTokenizer,
  AutoModelForCausalLM,
  env,
  type PreTrainedTokenizer,
  type PreTrainedModel,
  type Tensor,
} from "@huggingface/transformers";
import type { ChatMessage, GenerateOptions } from "./chat-types";
import { cleanGeneration, modelError } from "./chat-types";
import type { ChatModel } from "./models";
import { modelCache } from "./models";

env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.backends.onnx.wasm!.numThreads = 1; // Also works on GitHub Pages without COOP/COEP.
env.backends.onnx.wasm!.wasmPaths = `${self.location.origin}${import.meta.env.BASE_URL}onnx/`;
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
      new Error("Faltan recursos del modelo en caché. Descárgalo en IA local."),
    );
  return nativeFetch(input, init);
}) as typeof fetch;
let tokenizer: PreTrainedTokenizer | undefined;
let engine: PreTrainedModel | undefined;
let model: ChatModel;
// Two bounded, exact system prefixes cover routing and query interpretation.
// CPU tensors are read-only inputs; Transformers.js only disposes GPU KV tensors.
const prefixes: { tokens: bigint[]; past: Record<string, Tensor> }[] = [];
let sequence = Promise.resolve();
self.onmessage = (
  event: MessageEvent<{
    id: string;
    type: "load" | "generate";
    model: ChatModel;
    network?: boolean;
    messages?: ChatMessage[];
    options?: GenerateOptions;
  }>,
) => {
  sequence = sequence.then(async () => {
    const request = event.data;
    let stage =
      request.type === "load" ? "carga" : "preparación de la pregunta";
    try {
      if (request.type === "load") {
        model = request.model;
        prefixes.length = 0;
        network = request.network === true;
        env.customCache = await caches.open(modelCache(model));
        const options = {
          revision: model.revision,
          progress_callback: (p: Record<string, unknown>) => {
            if (p.progress !== undefined)
              self.postMessage({
                id: request.id,
                progress: Number(p.progress) / 100,
              });
          },
        };
        tokenizer = await AutoTokenizer.from_pretrained(model.modelId, options);
        engine = await AutoModelForCausalLM.from_pretrained(model.modelId, {
          ...options,
          dtype: "q8",
          device: "wasm",
          session_options: {
            graphOptimizationLevel: "disabled",
            enableCpuMemArena: false,
            enableMemPattern: false,
            extra: { session: { disable_prepacking: "1" } },
          },
        });
        network = false;
        self.postMessage({ id: request.id, result: true });
        return;
      }
      if (!engine || !tokenizer)
        throw new Error("El modelo CPU no está cargado.");
      const start = performance.now();
      const options = request.options || {};
      const maxTokens = request.options?.maxTokens ?? 600;
      const templateOptions = {
        add_generation_prompt: true,
        enable_thinking: false,
        return_dict: true,
      };
      const input = tokenizer.apply_chat_template(
        request.messages!,
        templateOptions,
      ) as { input_ids: Tensor; attention_mask: Tensor };
      const promptTokens = input.input_ids.dims[1];
      if (promptTokens + maxTokens > model.contextSize)
        throw new Error(
          "La petición supera el contexto del modelo. Acórtala sin quitar condiciones.",
        );
      // Prefill in bounded chunks: full-sequence logits can exhaust WASM's 4 GB
      // address space even when the quantized weights fit. Keep every input token.
      const tokensIn = Array.from(input.input_ids.data as BigInt64Array);
      const system = tokenizer.apply_chat_template([request.messages![0]], {
        ...templateOptions,
        add_generation_prompt: false,
      }) as { input_ids: Tensor };
      const prefixLength = Math.max(
        0,
        Math.min(768, Math.floor((system.input_ids.dims[1] - 1) / 128) * 128),
      );
      const cached = prefixes.find(
        (p) =>
          p.tokens.length <= prefixLength &&
          p.tokens.every((token, i) => token === tokensIn[i]),
      );
      const cachedPromptTokens = cached?.tokens.length || 0;
      let past: Record<string, Tensor> | undefined = cached?.past;
      if (cached) {
        prefixes.splice(prefixes.indexOf(cached), 1);
        prefixes.push(cached);
      }
      for (
        let offset = cachedPromptTokens;
        offset + 128 < promptTokens;
        offset += 128
      ) {
        const end = offset + 128;
        stage = `contexto ${end}/${promptTokens}`;
        const outputs = await engine.forward({
          input_ids: input.input_ids.slice(null, [offset, end]),
          attention_mask: input.attention_mask.slice(null, [0, end]),
          past_key_values: past,
        });
        past = engine.getPastKeyValues(outputs, past);
        outputs.logits.dispose();
        if (end === prefixLength && !cached) {
          prefixes.push({ tokens: tokensIn.slice(0, end), past: past! });
          if (prefixes.length > 2) prefixes.shift();
        }
      }
      const generationOptions = {
        inputs: input.input_ids,
        attention_mask: input.attention_mask,
        past_key_values: past,
        do_sample: (options.temperature ?? 0) > 0,
        ...((options.temperature ?? 0) > 0
          ? { temperature: options.temperature, top_p: options.topP ?? 1 }
          : {}),
        max_new_tokens: maxTokens,
      };
      stage = `generación con ${promptTokens} tokens de entrada`;
      const output = (await engine.generate(generationOptions)) as Tensor;
      const tokens = (output.tolist() as bigint[][])[0].slice(promptTokens);
      const content = cleanGeneration(
        tokenizer.decode(tokens, { skip_special_tokens: true }),
        tokens.length >= maxTokens,
      );
      self.postMessage({
        id: request.id,
        result: {
          content,
          promptTokens,
          completionTokens: tokens.length,
          cachedPromptTokens,
          milliseconds: performance.now() - start,
          modelKey: model.key,
        },
      });
    } catch (error) {
      self.postMessage({
        id: request.id,
        error: `CPU (${stage}): ${typeof error === "number" ? `código ${error}` : modelError(error).message}`,
      });
    } finally {
      network = false;
    }
  });
};
