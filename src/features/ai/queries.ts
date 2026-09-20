import type { Snapshot, Movement } from "../../data/types";
import {
  financialRows,
  money,
  normalize,
  totals,
  parseDate,
} from "../../lib/finance";
import { locationCandidates } from "../locations/parse";
export interface QuerySpec {
  op:
    | "search"
    | "sum"
    | "group"
    | "compare"
    | "recurrences"
    | "locations"
    | "merchant"
    | "clarify";
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  currency?: string;
  text?: string;
  direction?: "expense" | "income" | "all";
  comparisonFrom?: string;
  comparisonTo?: string;
  question?: string;
  publicName?: string;
  city?: string;
}
export function validateQuery(value: unknown, data: Snapshot): QuerySpec {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Tanu no ha podido interpretar la consulta. Prueba indicando fechas y categoría.",
    );
  const q = value as QuerySpec;
  const keys = [
    "op",
    "from",
    "to",
    "accountId",
    "categoryId",
    "currency",
    "text",
    "direction",
    "comparisonFrom",
    "comparisonTo",
    "question",
    "publicName",
    "city",
  ];
  if (
    Object.keys(q).some((k) => !keys.includes(k)) ||
    ![
      "search",
      "sum",
      "group",
      "compare",
      "recurrences",
      "locations",
      "merchant",
      "clarify",
    ].includes(q.op)
  )
    throw new Error("Consulta no permitida.");
  for (const [key, v] of Object.entries(q))
    if (typeof v !== "string" || v.length > 500)
      throw new Error(`Parámetro inválido: ${key}`);
  for (const key of ["from", "to", "comparisonFrom", "comparisonTo"] as const)
    if (
      q[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(q[key]!) ||
        !Number.isFinite(Date.parse(q[key]!)))
    )
      throw new Error("Fechas no válidas.");
  for (const key of ["from", "to", "comparisonFrom", "comparisonTo"] as const)
    if (q[key]) parseDate(q[key], "YMD");
  if (q.from && q.to && q.from > q.to)
    throw new Error("El período está invertido.");
  if (q.accountId && !data.accounts.some((a) => a.id === q.accountId))
    throw new Error("La cuenta indicada no existe.");
  if (q.categoryId && !data.categories.some((c) => c.id === q.categoryId))
    throw new Error("La categoría indicada no existe.");
  if (q.currency && !/^[A-Z]{3}$/.test(q.currency))
    throw new Error("Moneda no válida.");
  if (q.direction && !["expense", "income", "all"].includes(q.direction))
    throw new Error("Tipo de movimiento inválido.");
  if (["sum", "group", "compare"].includes(q.op) && (!q.from || !q.to))
    return {
      op: "clarify",
      question:
        "¿Qué período quieres consultar? Puedes indicar «este mes» o dos fechas.",
    };
  if (
    q.op === "compare" &&
    (!q.comparisonFrom || !q.comparisonTo || q.comparisonFrom > q.comparisonTo)
  )
    return { op: "clarify", question: "¿Con qué período quieres comparar?" };
  if (q.op === "merchant" && !q.publicName)
    return {
      op: "clarify",
      question:
        "¿Cuál es el nombre público del comercio y en qué localidad quieres buscar?",
    };
  return q;
}
export function executeQuery(
  q: QuerySpec,
  data: Snapshot,
): { text: string; rows: Movement[]; filters: string } {
  const categoryIds = new Set([
    q.categoryId,
    ...data.categories
      .filter((c) => c.parentId === q.categoryId)
      .map((c) => c.id),
  ]);
  const select = (from = q.from, to = q.to) =>
    (q.op === "search" || q.op === "locations"
      ? data.movements.map((m) => ({ ...m, isRefund: false }))
      : financialRows(data.movements, data.relations)
    ).filter(
      (m) =>
        (!from || m.date >= from) &&
        (!to || m.date <= to) &&
        (!q.accountId || m.accountId === q.accountId) &&
        (!q.categoryId || categoryIds.has(m.categoryId)) &&
        (!q.currency || m.currency === q.currency) &&
        (!q.text ||
          normalize(`${m.description} ${m.merchant} ${m.notes}`).includes(
            normalize(q.text),
          )) &&
        (q.direction !== "expense" || m.amount < 0 || m.isRefund) &&
        (q.direction !== "income" || (m.amount > 0 && !m.isRefund)),
    );
  let rows: Movement[] = select();
  const filters = [
    q.from && q.to ? `${q.from} → ${q.to}` : "Todo el historial",
    q.accountId
      ? data.accounts.find((a) => a.id === q.accountId)?.name
      : "Todas las cuentas",
    q.categoryId
      ? data.categories.find((c) => c.id === q.categoryId)?.name
      : "Todas las categorías",
    q.text && `Texto: ${q.text}`,
    q.direction && q.direction !== "all"
      ? q.direction === "expense"
        ? "Gastos y devoluciones"
        : "Ingresos"
      : null,
    q.currency,
  ]
    .filter(Boolean)
    .join(" · ");
  if (q.op === "clarify")
    return {
      text: q.question || "¿Puedes concretar tu pregunta?",
      rows: [],
      filters: "",
    };
  if (q.op === "recurrences")
    return {
      text:
        data.recurrences
          .filter(
            (r) => r.active && (!q.accountId || r.accountId === q.accountId),
          )
          .map(
            (r) =>
              `${r.name}: ${money(r.amount, r.currency)} · próxima fecha ${r.nextDate}`,
          )
          .join("\n") || "No hay recurrencias activas.",
      rows: [],
      filters,
    };
  if (q.op === "locations") {
    const suggestions = rows.map((m) => {
      const saved = data.assignments.find((a) => a.movementId === m.id);
      const place =
        saved && data.locations.find((l) => l.id === saved.locationId);
      if (place)
        return `${m.date} · ${m.merchant || m.description}: ${place.name} (${saved!.status === "confirmed" ? "confirmado" : "sugerido"}).`;
      const candidates = locationCandidates(
        m,
        data.locations,
        data.settings[0]?.timezone || "Europe/Madrid",
        false,
      );
      return `${m.date} · ${m.merchant || m.description}: ${
        candidates.length
          ? candidates
              .slice(0, 3)
              .map((c) => `${c.location.name} — ${c.evidence}`)
              .join("; ")
          : "sin coincidencias temporales"
      }.`;
    });
    return {
      text: suggestions.length
        ? `Posibles lugares; revisa la evidencia en el mapa antes de confirmar.\n${suggestions.slice(0, 10).join("\n")}`
        : "No hay movimientos con estos filtros.",
      rows,
      filters,
    };
  }
  const previous =
    q.op === "compare" ? select(q.comparisonFrom, q.comparisonTo) : [];
  if (!rows.length && !previous.length)
    return {
      text: "No hay movimientos que coincidan con estos filtros.",
      rows,
      filters,
    };
  if (q.op === "search")
    return { text: `He encontrado ${rows.length} movimientos.`, rows, filters };
  const currencies = [
    ...new Set([...rows, ...previous].map((m) => m.currency)),
  ];
  const text = currencies
    .map((currency) => {
      const current = rows.filter((m) => m.currency === currency),
        t = totals(current, data.relations, data.movements);
      if (q.op === "group") {
        const cats = [...new Set(current.map((m) => m.categoryId))];
        return (
          `${currency}\n` +
          cats
            .map((id) => {
              const amount = totals(
                current.filter((m) => m.categoryId === id),
                data.relations,
                data.movements,
              );
              return `${data.categories.find((c) => c.id === id)?.name || "Sin categorizar"}: ${money(q.direction === "income" ? amount.income : amount.expense, currency)}`;
            })
            .join("\n")
        );
      }
      if (q.op === "compare") {
        const before = previous.filter((m) => m.currency === currency);
        const old = totals(before, data.relations, data.movements);
        const metric = q.direction === "income" ? "income" : "expense";
        return `${currency}: ${metric === "income" ? "ingresos" : "gastos"} ${money(t[metric], currency)} frente a ${money(old[metric], currency)} (${q.comparisonFrom} → ${q.comparisonTo}). Diferencia: ${money(t[metric] - old[metric], currency)}.`;
      }
      return `${currency}: ingresos ${money(t.income, currency)} · gastos netos ${money(t.expense, currency)} · balance ${money(t.balance, currency)}.`;
    })
    .join("\n");
  return {
    text,
    rows: [...new Map([...rows, ...previous].map((m) => [m.id, m])).values()],
    filters,
  };
}
