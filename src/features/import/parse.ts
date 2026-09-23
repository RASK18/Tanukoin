import type { Account, Movement } from "../../data/types";
import { parseAmount, parseDate, fingerprint } from "../../lib/finance";
import type { Candidate, DetectedLayout } from "./types";
export function explicitCurrencies(text: string): string[] {
  const currencies = [
    ...text.matchAll(
      /(?<![a-z])(EUR|USD|GBP|CHF|JPY|CAD|MXN|ARS|COP|CLP)(?![a-z])/gi,
    ),
  ].map((match) => match[1].toUpperCase());
  if (text.includes("€")) currencies.push("EUR");
  return [...new Set(currencies)];
}
export const defaultLayout: DetectedLayout = {
  headerRow: 0,
  dateFormat: "DMY",
  decimal: ",",
  columns: {
    date: 0,
    description: 1,
    amount: 2,
    debit: -1,
    credit: -1,
    merchant: -1,
    externalId: -1,
    balance: -1,
  },
};
export function buildCandidates(
  rows: string[][],
  profile: DetectedLayout,
  account: Account,
  source: string,
  existing: Movement[],
): { candidates: Candidate[]; errors: string[]; warnings: string[] } {
  const candidates: Candidate[] = [],
    errors: string[] = [],
    warnings: string[] = [];
  const duplicateOfSaved = duplicateChecker(existing);
  const c = profile.columns;
  rows.slice(profile.headerRow + 1).forEach((row, index) => {
    const rowNumber = index + profile.headerRow + 2;
    if (!row.some((cell) => String(cell).trim())) return;
    try {
      const date = parseDate(row[c.date], profile.dateFormat);
      const cell = (index: number | undefined) =>
        String(row[index ?? -1] ?? "").trim();
      const currencies = new Set(
        [
          cell(c.currency).toUpperCase(),
          profile.currency,
          ...explicitCurrencies(
            [c.amount, c.debit, c.credit, c.balance, c.fee].map(cell).join(" "),
          ),
        ].filter((value): value is string => !!value),
      );
      if (currencies.size > 1)
        throw new Error("El movimiento contiene monedas contradictorias");
      const currency = [...currencies][0] || account.currency;
      if (!/^[A-Z]{3}$/.test(currency) || currency !== account.currency)
        throw new Error(
          `La moneda ${currency} no coincide con la cuenta ${account.currency}`,
        );
      if (
        profile.bank === "revolut" &&
        !["COMPLETADO", "COMPLETED"].includes(cell(c.status).toUpperCase())
      ) {
        warnings.push(
          `Fila ${rowNumber}: operación no completada; no se importará.`,
        );
        return;
      }
      const useful = (value: string) => (value && value !== "-" ? value : "");
      const description =
        profile.bank === "n26"
          ? [
              ...new Set(
                [useful(cell(c.merchant)), useful(cell(c.reference))].filter(
                  Boolean,
                ),
              ),
            ].join(" · ") ||
            useful(cell(c.type)) ||
            "Sin concepto"
          : cell(c.description) || "Sin concepto";
      const notes: string[] = cell(c.notes) ? [cell(c.notes)] : [];
      for (const [key, label] of [
        ["valueDate", "Fecha valor"],
        ["bookingDate", "Fecha contable / finalización"],
      ] as const) {
        const value = cell(c[key]);
        if (value) {
          parseDate(value, profile.dateFormat);
          notes.push(`${label}: ${value}`);
        }
      }
      const originalDate = cell(c.date);
      if (/\d{2}:\d{2}/.test(originalDate))
        notes.push(`Fecha de operación original: ${originalDate}`);
      let amount: number;
      if (c.amount >= 0)
        amount = parseAmount(row[c.amount], profile.decimal, account.currency);
      else {
        const debit =
          c.debit >= 0 && row[c.debit]?.trim()
            ? Math.abs(
                parseAmount(row[c.debit], profile.decimal, account.currency),
              )
            : 0;
        const credit =
          c.credit >= 0 && row[c.credit]?.trim()
            ? Math.abs(
                parseAmount(row[c.credit], profile.decimal, account.currency),
              )
            : 0;
        if (debit && credit)
          throw new Error("Debe y haber tienen importe simultáneamente");
        if (!cell(c.debit) && !cell(c.credit))
          throw new Error("Falta el importe");
        amount = credit - debit;
      }
      if (profile.bank === "revolut" && cell(c.fee)) {
        const fee = parseAmount(cell(c.fee), profile.decimal, currency);
        if (fee < 0) throw new Error("La comisión no puede ser negativa");
        if (fee)
          notes.push(
            `Importe original: ${cell(c.amount)} ${currency}. Comisión incluida: ${cell(c.fee)} ${currency}.`,
          );
        amount -= fee;
      }
      if (!Number.isSafeInteger(amount))
        throw new Error("Importe fuera de rango");
      const m: Movement = {
        id: crypto.randomUUID(),
        accountId: account.id,
        amount,
        balance:
          c.balance !== undefined && c.balance >= 0 && row[c.balance]?.trim()
            ? parseAmount(row[c.balance], profile.decimal, account.currency)
            : undefined,
        currency: account.currency,
        description,
        merchant: c.merchant >= 0 ? String(row[c.merchant] || "").trim() : "",
        date,
        categorySource: "none",
        tagIds: [],
        notes: notes.join("\n"),
        bookingDate: cell(c.bookingDate)
          ? parseDate(cell(c.bookingDate), profile.dateFormat)
          : undefined,
        timestamp:
          /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(originalDate) &&
          Number.isFinite(Date.parse(originalDate))
            ? originalDate
            : undefined,
        source,
        externalId:
          c.externalId >= 0
            ? String(row[c.externalId] || "").trim() || undefined
            : undefined,
        fingerprint: "",
        createdAt: new Date().toISOString(),
      };
      m.fingerprint = fingerprint(m);
      candidates.push({ movement: m, row: rowNumber, ...duplicateOfSaved(m) });
    } catch (error) {
      errors.push(
        `Fila ${rowNumber}: ${error instanceof Error ? error.message : "Dato no válido"}`,
      );
    }
  });
  return { candidates, errors, warnings };
}

export function duplicateChecker(existing: Movement[]) {
  const byContent = new Map<string, Movement[]>();
  const external = new Set<string>();
  for (const m of existing) {
    const key = fingerprint(m);
    byContent.set(key, [...(byContent.get(key) || []), m]);
    if (m.externalId) external.add(JSON.stringify([m.accountId, m.externalId]));
  }
  return (
    m: Movement,
  ): Pick<Candidate, "duplicate" | "selected" | "balanceMissing"> => {
    if (
      m.externalId &&
      external.has(JSON.stringify([m.accountId, m.externalId]))
    )
      return { duplicate: "exact", selected: false };
    const matches = byContent.get(fingerprint(m)) || [];
    if (
      m.balance !== undefined &&
      matches.some((old) => old.balance === m.balance)
    )
      return { duplicate: "possible", selected: false };
    // Older imports may lack a balance. Flag the uncertainty without dropping a row.
    if (
      matches.some(
        (old) => old.balance === undefined || m.balance === undefined,
      )
    )
      return { duplicate: "possible", selected: true, balanceMissing: true };
    return { duplicate: "none", selected: true };
  };
}
