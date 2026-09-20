import type { Movement, Relation, Rule, Recurrence } from "../data/types";
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export const currencyDigits = (currency: string) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
export const money = (amount: number, currency = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(
    amount / 10 ** currencyDigits(currency),
  );
export const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const displayDate = (date: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
export function parseAmount(
  input: unknown,
  decimal: "," | ".",
  currency = "EUR",
): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error("Importe no válido");
    return Math.round(input * 10 ** currencyDigits(currency));
  }
  const original = String(input ?? "").trim();
  if (!original) throw new Error("Falta el importe");
  let text = original.replace(/\s|€|EUR|USD|GBP|\$|£/gi, "");
  const negative = /^\(.*\)$/.test(text) || text.endsWith("-");
  text = text.replace(/[()]/g, "").replace(/-$/, "");
  const grouping = decimal === "," ? "." : ",";
  if (text.includes(grouping)) {
    const integerPart = text.split(decimal)[0].replace(/^[+-]/, "");
    if (!new RegExp(`^\\d{1,3}(\\${grouping}\\d{3})+$`).test(integerPart))
      throw new Error(`Separador ambiguo: ${original}`);
  }
  text = text.split(grouping).join("").replace(decimal, ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(text))
    throw new Error(`Importe no válido: ${original}`);
  const digits = currencyDigits(currency);
  if ((text.split(".")[1]?.length || 0) > digits)
    throw new Error(`Demasiados decimales: ${original}`);
  const result = Math.round(Number(text) * 10 ** digits) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(result)) throw new Error("Importe fuera de rango");
  return result;
}
export function parseDate(
  input: unknown,
  format: "DMY" | "MDY" | "YMD",
): string {
  if (input instanceof Date) return localDate(input);
  const text = String(input ?? "").trim();
  const parts = text.match(
    /^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})(?:\s.*|T.*)?$/,
  );
  if (!parts) throw new Error(`Fecha no válida: ${text}`);
  let [a, b, c] = parts.slice(1).map(Number);
  let y: number, m: number, d: number;
  if (parts[1].length === 4 || format === "YMD") [y, m, d] = [a, b, c];
  else if (format === "MDY") [y, m, d] = [c, a, b];
  else [y, m, d] = [c, b, a];
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  )
    throw new Error(`Fecha imposible: ${text}`);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function fingerprint(
  m: Pick<
    Movement,
    "accountId" | "date" | "amount" | "currency" | "description"
  >,
) {
  return JSON.stringify([
    m.accountId,
    m.date,
    m.amount,
    m.currency,
    normalize(m.description),
  ]);
}
export function applyRules(movement: Movement, rules: Rule[]): Movement {
  if (movement.categorySource === "manual") return movement;
  const rule = [...rules]
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .find(
      (r) =>
        r.enabled &&
        (!r.descriptionContains ||
          normalize(movement.description).includes(
            normalize(r.descriptionContains),
          )) &&
        (!r.merchantContains ||
          normalize(movement.merchant).includes(
            normalize(r.merchantContains),
          )) &&
        (!r.accountId || r.accountId === movement.accountId) &&
        (r.minAmount === undefined || movement.amount >= r.minAmount) &&
        (r.maxAmount === undefined || movement.amount <= r.maxAmount),
    );
  return rule
    ? {
        ...movement,
        categoryId: rule.categoryId || movement.categoryId,
        categorySource: rule.categoryId ? "rule" : movement.categorySource,
        notes: rule.note || movement.notes,
        aiSuggestion: undefined,
      }
    : movement;
}
export function financialRows(
  movements: Movement[],
  relations: Relation[],
  all: Movement[] = movements,
) {
  const transfers = new Set(
    relations
      .filter((r) => r.type === "transfer")
      .flatMap((r) => r.movementIds),
  );
  const refunds = new Map<string, string | undefined>();
  for (const r of relations.filter((r) => r.type === "refund")) {
    const original = all.find(
      (m) => r.movementIds.includes(m.id) && m.amount < 0,
    );
    if (original)
      for (const id of r.movementIds)
        if (id !== original.id) refunds.set(id, original.categoryId);
  }
  return movements
    .filter((m) => !transfers.has(m.id))
    .map((m) => ({
      ...m,
      categoryId: refunds.has(m.id) ? refunds.get(m.id) : m.categoryId,
      isRefund: refunds.has(m.id),
    }));
}
export function totals(
  movements: Movement[],
  relations: Relation[],
  all = movements,
) {
  return financialRows(movements, relations, all).reduce(
    (t, m) => ({
      income: t.income + (m.amount > 0 && !m.isRefund ? m.amount : 0),
      expense: t.expense + (m.amount < 0 || m.isRefund ? -m.amount : 0),
      balance: t.balance + m.amount,
    }),
    { income: 0, expense: 0, balance: 0 },
  );
}
export function recurrenceDate(
  anchor: string,
  frequency: Recurrence["frequency"],
  step: number,
): string {
  const [y, m, d] = anchor.split("-").map(Number);
  if (frequency === "weekly") {
    const date = new Date(y, m - 1, d + step * 7, 12);
    return localDate(date);
  }
  const target = new Date(
    y + (frequency === "yearly" ? step : 0),
    m - 1 + (frequency === "monthly" ? step : 0),
    1,
    12,
  );
  const last = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(d, last));
  return localDate(target);
}
export function occurrences(r: Recurrence, from: string, to: string): string[] {
  if (!r.active) return [];
  const dates: string[] = [];
  for (let step = 0; step < 20000; step++) {
    const date = recurrenceDate(r.anchorDate, r.frequency, step);
    if (date > to) break;
    if (date >= from && date >= r.nextDate) dates.push(date);
  }
  return dates;
}
export function nextOccurrence(r: Recurrence, after: string): string {
  for (let step = 0; step < 20000; step++) {
    const date = recurrenceDate(r.anchorDate, r.frequency, step);
    if (date > after) return date;
  }
  throw new Error("Fecha de recurrencia fuera de rango");
}
export function suggestRecurrences(
  movements: Movement[],
  existing: Recurrence[],
): Movement[][] {
  const groups = new Map<string, Movement[]>();
  for (const m of movements.filter((m) => m.amount < 0)) {
    const key = `${m.accountId}|${normalize(m.merchant || m.description)}`;
    groups.set(key, [...(groups.get(key) || []), m]);
  }
  return [...groups.values()].filter((group) => {
    group.sort((a, b) => a.date.localeCompare(b.date));
    if (
      group.length < 3 ||
      existing.some(
        (r) =>
          r.accountId === group[0].accountId &&
          normalize(r.name) ===
            normalize(group[0].merchant || group[0].description),
      )
    )
      return false;
    const recent = group.slice(-3);
    const amount = Math.abs(recent[0].amount);
    return (
      recent.every(
        (m) =>
          Math.abs(Math.abs(m.amount) - amount) <= Math.max(1, amount * 0.05),
      ) &&
      recent.slice(1).every((m, i) => {
        const days =
          (Date.parse(m.date) - Date.parse(recent[i].date)) / 86400000;
        return days >= 25 && days <= 35;
      })
    );
  });
}
export function validateRelation(type: Relation["type"], rows: Movement[]) {
  if (rows.length < 2) throw new Error("Selecciona al menos dos movimientos");
  if (
    type === "transfer" &&
    (rows.length !== 2 ||
      rows[0].accountId === rows[1].accountId ||
      rows[0].currency !== rows[1].currency ||
      rows[0].amount + rows[1].amount !== 0)
  )
    throw new Error(
      "Una transferencia necesita dos cuentas distintas, misma moneda e importes opuestos",
    );
  if (
    type === "refund" &&
    (rows.filter((m) => m.amount < 0).length !== 1 ||
      !rows.some((m) => m.amount > 0) ||
      new Set(rows.map((m) => m.currency)).size !== 1)
  )
    throw new Error(
      "Vincula un gasto con una o más devoluciones en la misma moneda",
    );
}
