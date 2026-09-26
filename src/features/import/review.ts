import type { Movement } from "../../data/types";
import {
  currencyDigits,
  fingerprint,
  parseAmount,
  parseDate,
  parseTime,
  parseExchangeRate,
  validateMovementDates,
  validateMovementCosts,
  validateOriginalAmount,
} from "../../lib/finance";
import { orderMovements } from "../../lib/movement-order";
import { sanitizeMovementText } from "../../lib/movement-text";
import type { Candidate, ImportIssue, ReviewField } from "./types";

export function reviewIssues(candidate: Candidate): ImportIssue[] {
  const issues = (candidate.issues || []).filter((issue) => !issue.resolved);
  if (candidate.movement.order?.sourceIssue)
    issues.push({
      row: candidate.row,
      fields: [
        "date",
        "secondaryDate",
        "time",
        "secondaryTime",
        "amount",
        "balance",
      ],
      message:
        "Las fechas o los saldos no confirman la secuencia del extracto. Revisa los datos; corregirlos no cambia su posición.",
    });
  if (candidate.duplicate === "possible" && !("match" in candidate))
    issues.push({
      row: candidate.row,
      fields: [],
      message: candidate.balanceMissing
        ? "Coincidencia sin saldo bancario comparable. Decide si incluir esta operación."
        : "Posible duplicado. Decide si incluir esta operación.",
    });
  return issues;
}

export function fieldValue(m: Movement, field: ReviewField): string {
  const value = m[field];
  if (typeof value !== "number") return value || "";
  const digits = currencyDigits(
    field === "originalAmount" ? m.originalCurrency || m.currency : m.currency,
  );
  return (value / 10 ** digits).toFixed(digits).replace(".", ",");
}

/** Validate the complete draft together, particularly original amount/currency pairs. */
export function editReviewedMovement(
  c: Candidate,
  edits: Partial<Record<ReviewField, string>>,
): Movement {
  const allowed = new Set(
    [...(c.issues || []), ...reviewIssues(c)].flatMap((issue) => issue.fields),
  );
  const m = { ...c.movement };
  for (const key of Object.keys(edits) as ReviewField[])
    if (!allowed.has(key))
      throw new Error(
        "Este campo no tiene incidencias y no se puede editar durante la importación.",
      );
  if (edits.originalCurrency !== undefined)
    m.originalCurrency =
      edits.originalCurrency.trim().toUpperCase() || undefined;
  for (const [key, raw] of Object.entries(edits) as [ReviewField, string][]) {
    const value = raw.trim();
    if (key === "originalCurrency") continue;
    if (
      key === "amount" ||
      key === "balance" ||
      key === "fee" ||
      key === "originalAmount"
    ) {
      if (!value && key !== "amount") {
        m[key] = undefined;
        continue;
      }
      if (!value) throw new Error("Falta el importe.");
      if (key === "originalAmount" && !m.originalCurrency)
        throw new Error("Indica también la moneda original.");
      m[key] = parseAmount(
        value,
        ",",
        key === "originalAmount" ? m.originalCurrency! : m.currency,
      );
    } else if (key === "date") m.date = parseDate(value, "YMD");
    else if (key === "secondaryDate")
      m.secondaryDate = value ? parseDate(value, "YMD") : undefined;
    else if (key === "time" || key === "secondaryTime")
      m[key] = parseTime(value);
    else if (key === "exchangeRate") m.exchangeRate = parseExchangeRate(value);
    else m[key] = value;
  }
  if (!m.description.trim()) throw new Error("Falta el concepto.");
  validateMovementDates(m);
  validateMovementCosts(m);
  validateOriginalAmount(m);
  Object.assign(m, sanitizeMovementText(m));
  m.manualFields = [...new Set([...(m.manualFields || []), ...Object.keys(edits)])];
  m.fingerprint = fingerprint(m);
  return m;
}

/** Count all reviewed source rows, even duplicates/deselected rows, only once. */
export function calculateReviewBalances(
  candidates: Candidate[],
  opening: string,
): Candidate[] {
  if (
    candidates.some(
      (c) => c.movement.balance !== undefined && !c.movement.balanceSource,
    )
  )
    throw new Error(
      "El extracto contiene saldos; no se pueden sustituir por cálculos.",
    );
  if (!opening.trim())
    throw new Error("Indica el saldo antes del primer movimiento.");
  const currency = candidates[0]?.movement.currency;
  if (
    !currency ||
    new Set(
      candidates.map((c) => `${c.movement.accountId}:${c.movement.currency}`),
    ).size !== 1
  )
    throw new Error("El cálculo requiere una única cuenta y moneda.");
  let balance = parseAmount(opening, ",", currency);
  const balances = new Map<string, number>();
  for (const m of orderMovements(candidates.map((c) => c.movement))) {
    balance += m.amount;
    if (!Number.isSafeInteger(balance))
      throw new Error("Saldo calculado fuera de rango.");
    balances.set(m.id, balance);
  }
  return candidates.map((c) => ({
    ...c,
    movement: {
      ...c.movement,
      balance: balances.get(c.movement.id)!,
      balanceSource: "calculated",
    },
  }));
}

/** Resolve only validated, explicitly completed fields; keep unrelated source notes. */
export function resolveReviewedCandidate(
  c: Candidate,
  edits: Partial<Record<ReviewField, string>>,
): Candidate {
  const movement = editReviewedMovement(c, edits);
  const issues = c.issues?.map((issue) => ({
    ...issue,
    resolved:
      !!issue.noteFragments?.length &&
      issue.fields.length > 0 &&
      issue.fields.every(
        (field) =>
          !!edits[field]?.trim() &&
          movement[field] !== undefined &&
          movement[field] !== "",
      ),
  }));
  const reviewOriginalNotes = c.reviewOriginalNotes ?? c.movement.notes;
  return refreshReviewNotes({
    ...c,
    edits,
    issues,
    reviewOriginalNotes,
    movement,
  });
}

export function refreshReviewNotes(c: Candidate): Candidate {
  let notes = c.reviewOriginalNotes ?? c.movement.notes ?? "";
  for (const issue of c.issues || []) {
    if (!issue.resolved) continue;
    for (const fragment of issue.noteFragments || [])
      notes = notes.replace(fragment, "");
  }
  return {
    ...c,
    movement: {
      ...c.movement,
      notes: notes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"),
    },
  };
}
