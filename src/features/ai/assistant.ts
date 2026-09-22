import type { Snapshot } from "../../data/types";
import { generateChat } from "./chat-runtime";
import { type ChatMessage, type Generate, type Generation } from "./chat-types";
import { executeQuery, type QueryResult, type QuerySpec } from "./queries";
import {
  draftSchema,
  normalizeDraft,
  readDraft,
  completeDraft,
  resolvePeriod,
  type QueryDraft,
} from "./query-intent";
import { helpTopics, helpRoutes, type HelpTopic } from "./help";
import {
  conversationPrompt,
  helpPrompt,
  intentPrompt,
  routePrompt,
} from "./prompt";

export interface AssistantState {
  history: ChatMessage[];
  lastDraft?: QueryDraft;
  lastQuery?: QuerySpec;
  pending?: QueryDraft;
  pendingYear?: number;
}
export const emptyConversation = (): AssistantState => ({ history: [] });
export interface AssistantReply {
  kind: "reply" | "help" | "query" | "clarify" | "merchant";
  text: string;
  query?: QuerySpec;
  result?: QueryResult;
  links?: { label: string; to: string }[];
  state: AssistantState;
}
interface Action {
  kind: "reply" | "help" | "query" | "clarify";
  context?: "new" | "continue";
  text?: string;
  topics?: HelpTopic[];
}
export const routeSchema = JSON.stringify({
  oneOf: [
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["query"] },
        context: { type: "string", enum: ["new", "continue"] },
      },
      required: ["kind", "context"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["clarify"] },
        text: { type: "string" },
      },
      required: ["kind", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { kind: { type: "string", enum: ["reply"] } },
      required: ["kind"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["help"] },
        topics: {
          type: "array",
          items: { type: "string", enum: Object.keys(helpTopics) },
          minItems: 1,
          maxItems: 3,
        },
      },
      required: ["kind", "topics"],
      additionalProperties: false,
    },
  ],
});
const answerSchema =
  '{"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":false}';
function answerText(value: unknown): string {
  const text = (value as { text?: unknown })?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 2000)
    throw new Error("Falta una respuesta breve en text.");
  return text.trim();
}
function readAction(value: unknown): Action {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !["kind", "context", "text", "topics"].includes(k),
    )
  )
    throw new Error("Decisión no válida.");
  const action = value as Action;
  if (!["reply", "help", "query", "clarify"].includes(action.kind))
    throw new Error("Decisión no permitida.");
  const fields =
    action.kind === "query"
      ? ["kind", "context"]
      : action.kind === "help"
        ? ["kind", "topics"]
        : action.kind === "reply"
          ? ["kind"]
          : ["kind", "text"];
  if (
    action.kind === "query" &&
    !["new", "continue"].includes(action.context || "")
  )
    throw new Error("Contexto no válido.");
  if (action.kind === "clarify") answerText(action);
  if (
    action.kind === "help" &&
    (!Array.isArray(action.topics) ||
      !action.topics.length ||
      action.topics.length > 3 ||
      action.topics.some((t) => !Object.hasOwn(helpTopics, t)))
  )
    throw new Error("Elige un tema de la guía.");
  // CPU may fill unused branch fields. Keep only the chosen decision's payload.
  return Object.fromEntries(
    Object.entries(action).filter(([key]) => fields.includes(key)),
  ) as unknown as Action;
}
export async function askAssistant(
  question: string,
  state: AssistantState,
  data: Snapshot,
  today: string,
  generate: Generate = generateChat,
  observe?: (generation: Generation) => void,
): Promise<AssistantReply> {
  if (!question.trim()) throw new Error("Escribe una pregunta.");
  let calls = 0,
    repaired = false;
  const history = state.history.slice(-6);
  async function structured<T>(
    system: string,
    schema: string,
    read: (value: unknown) => T,
    maxTokens = 450,
  ): Promise<T> {
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: question },
    ];
    for (;;) {
      if (++calls > 3)
        throw new Error(
          "No he podido interpretar la petición. Concreta la condición que necesitas consultar.",
        );
      const generation = await generate(messages, { schema, maxTokens });
      observe?.(generation);
      try {
        return read(JSON.parse(generation.content));
      } catch (error) {
        if (repaired || calls >= 3)
          throw new Error(
            "No he podido interpretar todos los parámetros. Prueba reformulando la petición.",
          );
        repaired = true;
        messages.push(
          { role: "assistant", content: generation.content },
          {
            role: "user",
            content: `Corrige el JSON: ${error instanceof Error ? error.message : "JSON inválido"}. Conserva las condiciones solicitadas y quita los campos no solicitados. Pregunta original: ${question}`,
          },
        );
      }
    }
  }
  function finish(
    reply: Omit<AssistantReply, "state">,
    next: Partial<AssistantState> = {},
  ): AssistantReply {
    return {
      ...reply,
      state: {
        ...state,
        ...next,
        history: [
          ...history,
          { role: "user" as const, content: question },
          { role: "assistant" as const, content: reply.text.slice(0, 1000) },
        ].slice(-6),
      },
    };
  }
  const pendingContext = state.pending
    ? `\nHay una consulta pendiente de aclaración (datos): ${JSON.stringify(state.pending)}`
    : "";
  const action = await structured(
    routePrompt + pendingContext,
    routeSchema,
    readAction,
    180,
  );
  if (action.kind === "reply") {
    if (++calls > 3)
      throw new Error("No he podido completar la respuesta. Prueba de nuevo.");
    const response = await generate(
      [
        { role: "system", content: conversationPrompt },
        ...history,
        { role: "user", content: question },
      ],
      { maxTokens: 320, temperature: 0.7, topP: 0.8 },
    );
    observe?.(response);
    return finish({
      kind: "reply",
      text: answerText({ text: response.content }),
    });
  }
  if (action.kind === "clarify")
    return finish({ kind: action.kind, text: answerText(action) });
  if (action.kind === "help") {
    const topics = action.topics!;
    const text = await structured(
      helpPrompt(topics),
      answerSchema,
      answerText,
      350,
    );
    const links = topics.flatMap((topic) =>
      helpRoutes[topic]
        ? [{ label: "Abrir sección", to: helpRoutes[topic]! }]
        : [],
    );
    return finish({
      kind: "help",
      text,
      links: [...new Map(links.map((l) => [l.to, l])).values()],
    });
  }
  const previous =
    action.context === "continue"
      ? state.pending || state.lastDraft
      : undefined;
  const year = previous
    ? state.pending
      ? state.pendingYear
      : Number((state.lastQuery?.from || state.lastQuery?.to)?.slice(0, 4)) ||
        undefined
    : undefined;
  const interpreted = await structured(
    intentPrompt(today, previous, {
      accounts: data.accounts.map((a) => a.name).slice(0, 30),
      categories: data.categories.map((c) => c.name).slice(0, 60),
    }),
    draftSchema,
    (value) => {
      const draft = completeDraft(
        readDraft(value),
        previous === state.pending ? state.pending : undefined,
      );
      const query = normalizeDraft(draft, data, today, year);
      if (
        query.op === "clarify" &&
        draft.mode === "trimmed" &&
        draft.trimPercent === undefined &&
        (draft.amountMin !== undefined || draft.amountMax !== undefined) &&
        !repaired &&
        calls < 3
      )
        throw new Error(
          "Revisa mode: has indicado límites monetarios, pero trimmed requiere un porcentaje por extremo. bounded corresponde a una media o mediana acotada por importes. Usa bounded si la petición solo acota importes. Mantén trimmed únicamente si la pregunta solicita además recortar un porcentaje de los extremos; si ese porcentaje falta, déjalo sin valor. Conserva todos los demás filtros.",
        );
      return { draft, query };
    },
  );
  const { draft, query } = interpreted;
  if (query.op === "clarify") {
    let pendingYear = year || Number(today.slice(0, 4));
    if (draft.period) {
      try {
        const period = resolvePeriod(draft.period, today, year);
        pendingYear =
          Number((period.from || period.to)?.slice(0, 4)) || pendingYear;
      } catch {
        // An unresolved date can itself be the subject of the pending clarification.
      }
    }
    return finish(
      { kind: "clarify", text: query.question },
      {
        pending: draft,
        pendingYear,
      },
    );
  }
  const resolved = {
    ...draft,
    ...(query.from || query.to
      ? { period: { kind: "range" as const, from: query.from, to: query.to } }
      : {}),
  };
  const next = {
    pending: undefined,
    pendingYear: undefined,
    lastDraft: resolved,
    lastQuery: query,
  };
  if (query.op === "merchant")
    return finish(
      {
        kind: "merchant",
        query,
        text: "Revisa el nombre público y la localidad antes de enviar la búsqueda.",
      },
      next,
    );
  const result = executeQuery(query, data);
  return finish({ kind: "query", text: result.text, query, result }, next);
}
