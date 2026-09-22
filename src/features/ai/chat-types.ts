export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface GenerateOptions {
  schema?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}
export interface Generation {
  content: string;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens?: number;
  milliseconds: number;
  modelKey: string;
}
export type Generate = (
  messages: ChatMessage[],
  options?: GenerateOptions,
) => Promise<Generation>;
export function cleanGeneration(content: string, truncated = false) {
  if (truncated)
    throw new Error(
      "La respuesta se ha cortado antes de terminar. Prueba una consulta más breve.",
    );
  const result = content
    .replace(/^\s*<think>\s*<\/think>\s*/, "")
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1")
    .trim();
  if (!result)
    throw new Error(
      "El modelo no ha devuelto una respuesta. Compruébalo en IA local.",
    );
  return result;
}
export function modelError(error: unknown) {
  return error instanceof Error
    ? error
    : new Error(
        typeof error === "string" && error.trim()
          ? error
          : "El motor de IA local ha fallado. Comprueba el modelo en IA local.",
      );
}
// Estimate for history selection. Each runtime enforces the actual token limit too.
export function fitMessages(
  messages: ChatMessage[],
  maxTokens = 600,
  context = 4096,
) {
  const selected = messages.map((m) => ({ ...m }));
  const estimate = () =>
    selected.reduce(
      (n, m) =>
        n + Math.ceil(new TextEncoder().encode(m.content).length / 3) + 12,
      0,
    );
  while (estimate() + maxTokens > context && selected.length > 2)
    selected.splice(1, Math.min(2, selected.length - 2));
  if (estimate() + maxTokens > context)
    throw new Error(
      "La petición es demasiado larga para el modelo. Acórtala sin quitar las condiciones que necesitas.",
    );
  return selected;
}
