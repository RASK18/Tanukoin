import { expect, it, vi } from "vitest";
import { askAssistant, emptyConversation } from "../src/features/ai/assistant";
import {
  amountInMinorUnits,
  completeDraft,
  normalizeDraft,
  readDraft,
  resolvePeriod,
} from "../src/features/ai/query-intent";
import { fitMessages } from "../src/features/ai/chat-types";
import { chatFixture, chatScenarios } from "./ai-corpus";

const today = "2026-09-21";
function fake(...outputs: unknown[]) {
  return vi.fn(async () => {
    const output = outputs.shift();
    return {
      content: typeof output === "string" ? output : JSON.stringify(output),
      promptTokens: 100,
      completionTokens: 30,
      milliseconds: 1,
      modelKey: "fake",
    };
  });
}
it("separa conversación de decisión y conserva la consulta pendiente", async () => {
  const generate = fake({ kind: "reply" }, "Soy Tanu. Podemos hablar un rato.");
  const state = emptyConversation();
  state.pending = { op: "mean", mode: "trimmed" };
  const reply = await askAssistant(
    "¿Podemos hablar?",
    state,
    chatFixture(),
    today,
    generate,
  );
  expect(reply.kind).toBe("reply");
  expect(reply.text).toBe("Soy Tanu. Podemos hablar un rato.");
  expect(reply.state.pending).toEqual(state.pending);
  expect(generate).toHaveBeenCalledTimes(2);
  const calls = generate.mock.calls as unknown as [
    unknown,
    Record<string, unknown>,
  ][];
  expect(calls[0][1].schema).toBeTruthy();
  expect(calls[1][1]).toEqual({ maxTokens: 320, temperature: 0.7, topP: 0.8 });
});
it("resuelve calendario y año contextual sin reconocer frases", () => {
  expect(
    resolvePeriod(
      { kind: "relative", unit: "month", offset: -1 },
      "2026-01-21",
    ),
  ).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  expect(resolvePeriod({ kind: "month", month: 2 }, "2024-02-01")).toEqual({
    from: "2024-02-01",
    to: "2024-02-29",
  });
  expect(resolvePeriod({ kind: "month", month: 9 }, today, 2025).from).toBe(
    "2025-09-01",
  );
  expect(resolvePeriod({ kind: "relative", unit: "week" }, today)).toEqual({
    from: "2026-09-21",
    to: "2026-09-27",
  });
  expect(() =>
    resolvePeriod({ kind: "range", from: "2026-02-30" }, today),
  ).toThrow();
});
it("normaliza importes por moneda y no pierde condiciones pendientes", () => {
  expect(amountInMinorUnits("20,50", "EUR")).toBe("2050");
  expect(amountInMinorUnits("20", "JPY")).toBe("20");
  expect(amountInMinorUnits("20.501", "KWD")).toBe("20501");
  expect(() => amountInMinorUnits("20.5", "JPY")).toThrow();
  const data = chatFixture();
  data.movements[0].currency = "USD";
  expect(
    normalizeDraft({ op: "search", amountMin: "10" }, data, today).op,
  ).toBe("clarify");
  expect(
    normalizeDraft(
      { op: "search", account: "ahorro", amountMin: "10" },
      data,
      today,
    ),
  ).toMatchObject({ accountId: "saving", minAmount: "1000", currency: "EUR" });
  expect(() =>
    readDraft({ op: "search", sql: "DELETE FROM movements" }),
  ).toThrow();
});
it("usa dos inferencias y calcula el máximo sin números generados", async () => {
  const generate = fake(
    { kind: "query", context: "new" },
    { op: "max", direction: "expense", period: { kind: "month", month: 9 } },
  );
  const reply = await askAssistant(
    "Busca mi mayor gasto de septiembre",
    emptyConversation(),
    chatFixture(),
    today,
    generate,
  );
  expect(reply.query).toMatchObject({ op: "max", from: "2026-09-01" });
  expect(reply.result?.rows.map((m) => m.id)).toEqual(["m4"]);
  expect(reply.text).toContain("1000,00");
  expect(generate).toHaveBeenCalledTimes(2);
});
it("valida la decisión elegida aunque CPU añada campos de otra rama", async () => {
  const generate = fake(
    {
      kind: "query",
      context: "new",
      text: "Pregunta original",
      topics: ["statistics"],
    },
    { op: "max", direction: "expense", period: { kind: "month", month: 9 } },
  );
  const result = await askAssistant(
    "Mayor gasto de septiembre",
    emptyConversation(),
    chatFixture(),
    today,
    generate,
  );
  expect(result.result?.rows.map((r) => r.id)).toEqual(["m4"]);
  expect(generate).toHaveBeenCalledTimes(2);
});
it("conserva el borrador completo hasta resolver una aclaración", async () => {
  const draft = {
    op: "mean",
    mode: "trimmed",
    direction: "expense",
    text: "supermercado",
    period: { kind: "month", month: 9 },
  };
  const first = await askAssistant(
    "Media truncada de supermercado en septiembre",
    emptyConversation(),
    chatFixture(),
    today,
    fake({ kind: "query", context: "new" }, draft),
  );
  expect(first.kind).toBe("clarify");
  expect(first.state.pending).toEqual(draft);
  const next = fake(
    { kind: "query", context: "continue" },
    { ...draft, trimPercent: "20" },
  );
  const result = await askAssistant(
    "20 % en cada extremo",
    first.state,
    chatFixture(),
    today,
    next,
  );
  expect(result.query).toMatchObject({
    op: "mean",
    text: "supermercado",
    trimPercent: "20",
  });
  expect(result.state.pending).toBeUndefined();
});
it("revisa la confusión entre límites y porcentajes sin superar tres inferencias", async () => {
  const draft = {
    op: "median",
    direction: "expense",
    period: { kind: "month", month: 9 },
    mode: "trimmed",
    amountMin: "20",
    amountMax: "40",
    currency: "EUR",
  };
  const generate = fake({ kind: "query", context: "new" }, draft, {
    ...draft,
    mode: "bounded",
  });
  const result = await askAssistant(
    "Mediana acotada de gastos de septiembre entre 20 y 40 euros",
    emptyConversation(),
    chatFixture(),
    today,
    generate,
  );
  expect(result.kind).toBe("query");
  expect(result.query).toMatchObject({
    mode: "bounded",
    minAmount: "2000",
    maxAmount: "4000",
  });
  expect(result.text).toContain("30,00");
  expect(generate).toHaveBeenCalledTimes(3);
});
it("no elimina un recorte solicitado junto con límites aunque falte su porcentaje", async () => {
  const draft = {
    op: "mean",
    direction: "expense",
    period: { kind: "month", month: 9 },
    mode: "trimmed",
    amountMin: "20",
    amountMax: "40",
    currency: "EUR",
  };
  const generate = fake({ kind: "query", context: "new" }, draft, draft);
  const reply = await askAssistant(
    "Media de septiembre entre 20 y 40 euros, y además truncada",
    emptyConversation(),
    chatFixture(),
    today,
    generate,
  );
  expect(reply.kind).toBe("clarify");
  expect(reply.state.pending).toEqual(draft);
  expect(reply.text).toContain("porcentaje");
  expect(generate).toHaveBeenCalledTimes(3);
});
it("una aclaración parcial conserva condiciones y solo retira filtros explícitos", () => {
  const previous = {
    op: "mean" as const,
    direction: "expense" as const,
    text: "supermercado",
    account: "Ahorro",
    mode: "trimmed" as const,
  };
  expect(
    completeDraft(
      readDraft({ op: "mean", text: null, trimPercent: "20", clear: [] }),
      previous,
    ),
  ).toEqual({ ...previous, trimPercent: "20" });
  expect(completeDraft({ op: "mean", clear: ["account"] }, previous)).toEqual({
    op: "mean",
    direction: "expense",
    text: "supermercado",
    mode: "trimmed",
  });
  expect(() => readDraft({ op: "search", clear: ["allData"] })).toThrow();
});
it("una pregunta nueva no hereda filtros; máximo tres intercambios", async () => {
  let state = emptyConversation();
  for (let i = 0; i < 5; i++)
    state = (
      await askAssistant(
        `Hola ${i}`,
        state,
        chatFixture(),
        today,
        fake({ kind: "reply" }, "Hola"),
      )
    ).state;
  expect(state.history).toHaveLength(6);
  state.lastDraft = { op: "search", text: "alquiler" };
  const generate = fake(
    { kind: "query", context: "new" },
    { op: "search", text: "nómina" },
  );
  const result = await askAssistant(
    "Busca nóminas",
    state,
    chatFixture(),
    today,
    generate,
  );
  expect(result.result?.rows.map((m) => m.id)).toEqual(["m5"]);
});
it("una consulta completa no recupera filtros que el modelo ha dejado sin valor", async () => {
  const state = emptyConversation();
  state.lastDraft = {
    op: "search",
    text: "alquiler",
    direction: "expense",
    period: { kind: "month", month: 9 },
  };
  state.lastQuery = {
    op: "search",
    text: "alquiler",
    direction: "expense",
    from: "2026-09-01",
    to: "2026-09-30",
  };
  const result = await askAssistant(
    "Busca nóminas de este mes",
    state,
    chatFixture(),
    today,
    fake(
      { kind: "query", context: "continue" },
      {
        op: "search",
        text: "nóminas",
        direction: null,
        period: { kind: "month", month: 9 },
      },
    ),
  );
  expect(result.query?.direction).toBeUndefined();
  expect(result.result?.rows.map((r) => r.id)).toEqual(["m5"]);
});
it("solo admite una corrección y tres inferencias", async () => {
  const repaired = fake(
    { kind: "inventado" },
    { kind: "query", context: "new" },
    { op: "search" },
  );
  expect(
    (
      await askAssistant(
        "Busca",
        emptyConversation(),
        chatFixture(),
        today,
        repaired,
      )
    ).kind,
  ).toBe("query");
  expect(repaired).toHaveBeenCalledTimes(3);
  const bad = fake(
    { kind: "inventado" },
    { kind: "query", context: "new" },
    { op: "delete" },
    { op: "search" },
  );
  await expect(
    askAssistant("Busca", emptyConversation(), chatFixture(), today, bad),
  ).rejects.toThrow("interpretar todos");
  expect(bad).toHaveBeenCalledTimes(3);
});
it("una aclaración nueva conserva su propio año, no el de una consulta antigua", async () => {
  const old = emptyConversation();
  old.lastQuery = {
    op: "max",
    from: "2025-09-01",
    to: "2025-09-30",
    direction: "expense",
  };
  const draft = { op: "median", period: { kind: "month", month: 9 } };
  const pending = await askAssistant(
    "Mediana de septiembre",
    old,
    chatFixture(),
    today,
    fake({ kind: "query", context: "new" }, draft),
  );
  const result = await askAssistant(
    "De gastos",
    pending.state,
    chatFixture(),
    today,
    fake(
      { kind: "query", context: "continue" },
      { ...draft, direction: "expense" },
    ),
  );
  expect(result.query?.from).toBe("2026-09-01");
});
it("una aclaración mantiene el año de un período relativo que cruza enero", async () => {
  const date = "2026-01-21";
  const first = await askAssistant(
    "Mediana del mes pasado",
    emptyConversation(),
    chatFixture(),
    date,
    fake(
      { kind: "query", context: "new" },
      { op: "median", period: { kind: "relative", unit: "month", offset: -1 } },
    ),
  );
  expect(first.kind).toBe("clarify");
  expect(first.state.pendingYear).toBe(2025);
  const next = await askAssistant(
    "De gastos, y cambia a agosto",
    first.state,
    chatFixture(),
    date,
    fake(
      { kind: "query", context: "continue" },
      {
        op: "median",
        direction: "expense",
        period: { kind: "month", month: 8 },
      },
    ),
  );
  expect(next.query?.from).toBe("2025-08-01");
});
it("ayuda recibe guía revisada y enlaces reales; no ejecuta movimientos", async () => {
  const generate = fake(
    { kind: "help", topics: ["banking"] },
    { text: "Sigue el tutorial de banca." },
  );
  const answer = await askAssistant(
    "¿Cómo conecto el banco?",
    emptyConversation(),
    chatFixture(),
    today,
    generate,
  );
  expect(answer.links).toEqual([{ label: "Abrir sección", to: "/banco" }]);
  expect(answer.result).toBeUndefined();
});
it("acota contexto eliminando intercambios antiguos y mantiene instrucciones y pregunta", () => {
  const system = { role: "system" as const, content: "instrucciones" },
    user = { role: "user" as const, content: "pregunta" };
  const result = fitMessages([
    system,
    { role: "user", content: "x".repeat(12000) },
    { role: "assistant", content: "respuesta" },
    user,
  ]);
  expect(result).toEqual([system, user]);
  expect(() =>
    fitMessages([{ ...system, content: "x".repeat(15000) }, user]),
  ).toThrow();
});
it("reserva 20 de 50 escenarios fuera de los ejemplos del prompt", () => {
  expect(chatScenarios).toHaveLength(50);
  expect(chatScenarios.filter((s) => s.heldOut)).toHaveLength(20);
});
