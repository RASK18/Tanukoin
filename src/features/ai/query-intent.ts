import type { Snapshot } from "../../data/types";
import { currencyDigits, normalize, parseDate } from "../../lib/finance";
import { validateQuery, type QuerySpec, type Clarification } from "./queries";

export type Period = {
  kind: "relative" | "month" | "year" | "range" | "all";
  unit?: "day" | "week" | "month" | "year";
  offset?: number;
  month?: number;
  year?: number;
  from?: string;
  to?: string;
};
export interface QueryDraft {
  op: QuerySpec["op"];
  period?: Period;
  comparison?: Period;
  direction?: QuerySpec["direction"];
  account?: string;
  category?: string;
  currency?: string;
  text?: string;
  excludeText?: string;
  amountMin?: string;
  amountMax?: string;
  mode?: QuerySpec["mode"];
  trimPercent?: string;
  publicName?: string;
  city?: string;
  unresolved?: string;
  clear?: string[];
}
const periodProperties = {
  kind: { type: "string", enum: ["relative", "month", "year", "range", "all"] },
  unit: { type: "string", enum: ["day", "week", "month", "year"] },
  offset: { type: "integer" },
  month: { type: "integer" },
  year: { type: "integer" },
  from: { type: "string" },
  to: { type: "string" },
};
const periodFields = {
  relative: ["unit", "offset"],
  month: ["month", "year"],
  year: ["year"],
  range: ["from", "to"],
  all: [],
} as const;
const periodSchema = {
  oneOf: Object.entries(periodFields).map(([kind, fields]) => ({
    type: "object",
    properties: {
      kind: { type: "string", enum: [kind] },
      ...Object.fromEntries(
        fields.map((field) => [field, periodProperties[field]]),
      ),
    },
    required: [
      "kind",
      ...(kind === "relative"
        ? ["unit"]
        : kind === "month"
          ? ["month"]
          : kind === "year"
            ? ["year"]
            : []),
    ],
    additionalProperties: false,
  })),
};
const draftFields = {
  op: {
    type: "string",
    enum: [
      "search",
      "sum",
      "group",
      "compare",
      "min",
      "max",
      "mean",
      "median",
      "recurrences",
      "locations",
      "merchant",
    ],
  },
  text: { type: "string" },
  excludeText: { type: "string" },
  direction: { type: "string", enum: ["expense", "income", "all"] },
  period: periodSchema,
  comparison: periodSchema,
  mode: { type: "string", enum: ["plain", "bounded", "trimmed"] },
  ...Object.fromEntries(
    [
      "account",
      "category",
      "currency",
      "amountMin",
      "amountMax",
      "trimPercent",
      "publicName",
      "city",
      "unresolved",
    ].map((key) => [key, { type: "string" }]),
  ),
};
const clearable = Object.keys(draftFields).filter(
  (key) => !["op", "unresolved"].includes(key),
);
export const draftSchema = JSON.stringify({
  type: "object",
  properties: {
    ...Object.fromEntries(
      Object.entries(draftFields).map(([key, value]) => [
        key,
        key === "op" ? value : { anyOf: [value, { type: "null" }] },
      ]),
    ),
    clear: { type: "array", items: { type: "string", enum: clearable } },
  },
  required: [...Object.keys(draftFields), "clear"],
  additionalProperties: false,
});
const draftProperties = Object.keys(JSON.parse(draftSchema).properties);
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new Error("La consulta contiene parámetros no permitidos.");
  return value as Record<string, unknown>;
}
export function readDraft(value: unknown): QueryDraft {
  const raw = record(value, draftProperties);
  const fields = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== null && value !== ""),
  );
  if (!JSON.parse(draftSchema).properties.op.enum.includes(fields.op))
    throw new Error("Operación no permitida.");
  for (const [key, item] of Object.entries(fields)) {
    if (key === "clear") {
      if (!Array.isArray(item) || item.some((key) => !clearable.includes(key)))
        throw new Error("Condiciones a retirar no válidas.");
    } else if (key === "period" || key === "comparison") {
      const p = record(item, Object.keys(periodProperties));
      if (!periodProperties.kind.enum.includes(p.kind as string))
        throw new Error("Período no permitido.");
      const allowed = [
        "kind",
        ...periodFields[p.kind as keyof typeof periodFields],
      ];
      if (Object.keys(p).some((key) => !allowed.includes(key)))
        throw new Error(
          `El período ${p.kind} contiene campos de otro tipo de fecha.`,
        );
      for (const [k, v] of Object.entries(p)) {
        if (["offset", "month", "year"].includes(k)) {
          if (!Number.isSafeInteger(v)) throw new Error("Fecha no válida.");
        } else if (typeof v !== "string" || v.length > 20)
          throw new Error("Fecha no válida.");
      }
    } else if (typeof item !== "string" || item.length > 500)
      throw new Error(`Parámetro inválido: ${key}`);
  }
  return fields as unknown as QueryDraft;
}
export function completeDraft(
  draft: QueryDraft,
  previous?: QueryDraft,
): QueryDraft {
  const base = { ...previous };
  delete base.unresolved;
  delete base.clear;
  for (const key of draft.clear || []) delete base[key as keyof QueryDraft];
  const complete = { ...base, ...draft };
  delete complete.clear;
  return complete;
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function resolvePeriod(
  period: Period,
  today: string,
  contextYear?: number,
): { from?: string; to?: string } {
  const [year, month, day] = today.split("-").map(Number);
  const validYear = (n: number) => {
    if (!Number.isInteger(n) || n < 100 || n > 9998)
      throw new Error("Año no válido.");
    return n;
  };
  if (period.kind === "all") return { from: "0001-01-01", to: "9999-12-31" };
  if (period.kind === "range") {
    if (!period.from && !period.to)
      throw new Error("Faltan las fechas del intervalo.");
    return {
      ...(period.from ? { from: parseDate(period.from, "YMD") } : {}),
      ...(period.to ? { to: parseDate(period.to, "YMD") } : {}),
    };
  }
  if (period.kind === "month") {
    if (!period.month || period.month < 1 || period.month > 12)
      throw new Error("Mes no válido.");
    const y = validYear(period.year ?? contextYear ?? year);
    return {
      from: iso(new Date(Date.UTC(y, period.month - 1, 1))),
      to: iso(new Date(Date.UTC(y, period.month, 0))),
    };
  }
  if (period.kind === "year") {
    const y = validYear(period.year ?? contextYear ?? year);
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  const offset = period.offset ?? 0;
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 1200)
    throw new Error("Desplazamiento de fecha no válido.");
  if (period.unit === "month") {
    const start = new Date(Date.UTC(year, month - 1 + offset, 1));
    return {
      from: iso(start),
      to: iso(
        new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)),
      ),
    };
  }
  if (period.unit === "year")
    return resolvePeriod({ kind: "year", year: year + offset }, today);
  if (period.unit === "day") {
    const date = iso(new Date(Date.UTC(year, month - 1, day + offset)));
    return { from: date, to: date };
  }
  if (period.unit === "week") {
    const date = new Date(Date.UTC(year, month - 1, day));
    const monday = day - ((date.getUTCDay() + 6) % 7) + 7 * offset;
    return {
      from: iso(new Date(Date.UTC(year, month - 1, monday))),
      to: iso(new Date(Date.UTC(year, month - 1, monday + 6))),
    };
  }
  throw new Error("Unidad de período no válida.");
}
export function amountInMinorUnits(text: string, currency: string) {
  if (!/^\d+(?:[.,]\d+)?$/.test(text))
    throw new Error("Usa un importe decimal sin separadores de miles.");
  const digits = currencyDigits(currency),
    [integer, fraction = ""] = text.replace(",", ".").split(".");
  if (fraction.length > digits)
    throw new Error("El importe tiene demasiados decimales para esta moneda.");
  const value =
    BigInt(integer) * 10n ** BigInt(digits) +
    BigInt(fraction.padEnd(digits, "0") || "0");
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Importe fuera de rango.");
  return value.toString();
}
export function normalizeDraft(
  draft: QueryDraft,
  data: Snapshot,
  today: string,
  contextYear?: number,
): QuerySpec | Clarification {
  if (draft.unresolved) return { op: "clarify", question: draft.unresolved };
  const q: QuerySpec = { op: draft.op };
  for (const key of [
    "direction",
    "currency",
    "text",
    "excludeText",
    "mode",
    "trimPercent",
    "publicName",
    "city",
  ] as const)
    if (draft[key] !== undefined) (q as any)[key] = draft[key];
  // "plain" means no trimming; it is equivalent to an absent mode outside statistics.
  if (q.mode === "plain" && !["mean", "median"].includes(q.op)) delete q.mode;
  if (draft.period)
    Object.assign(q, resolvePeriod(draft.period, today, contextYear));
  if (draft.comparison) {
    const period = resolvePeriod(draft.comparison, today, contextYear);
    q.comparisonFrom = period.from;
    q.comparisonTo = period.to;
  }
  for (const [key, records, target] of [
    ["account", data.accounts, "accountId"],
    ["category", data.categories, "categoryId"],
  ] as const) {
    if (!draft[key]) continue;
    const matches = records.filter(
      (r) => normalize(r.name) === normalize(draft[key]!),
    );
    if (matches.length !== 1)
      return {
        op: "clarify",
        question: matches.length
          ? `Hay varias coincidencias para «${draft[key]}». ¿Puedes concretar la ${key === "account" ? "cuenta" : "categoría"}?`
          : `No encuentro ${key === "account" ? "la cuenta" : "la categoría"} «${draft[key]}». ¿Cuál quieres consultar?`,
      };
    q[target] = matches[0].id;
  }
  if (draft.amountMin !== undefined || draft.amountMax !== undefined) {
    const currencies = [
      ...new Set(
        data.movements
          .filter((m) => !q.accountId || m.accountId === q.accountId)
          .map((m) => m.currency),
      ),
    ];
    const currency =
      q.currency || (currencies.length === 1 ? currencies[0] : undefined);
    if (!currency && currencies.length > 1)
      return {
        op: "clarify",
        question: "¿En qué moneda quieres aplicar los límites de importe?",
      };
    if (draft.amountMin !== undefined)
      q.minAmount = amountInMinorUnits(draft.amountMin, currency || "EUR");
    if (draft.amountMax !== undefined)
      q.maxAmount = amountInMinorUnits(draft.amountMax, currency || "EUR");
    if (currency) q.currency = currency;
  }
  return validateQuery(q, data);
}
