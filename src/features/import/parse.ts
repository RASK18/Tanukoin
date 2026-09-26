import type { Account, Movement } from "../../data/types";
import {
  parseAmount,
  sourceDateTime,
  movementDateRange,
  fingerprint,
  validateOriginalAmount,
  validateMovementCosts,
  parseExchangeRate,
} from "../../lib/finance";
import type { Candidate, DetectedLayout } from "./types";
import { normalizeImportedText } from "../../lib/movement-text";
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
      const cell = (index: number | undefined) =>
        String(row[index ?? -1] ?? "").trim();
      const dateCells = [
        ...new Set([
          c.date,
          c.valueDate,
          c.bookingDate,
          c.completionDate,
          c.secondaryDate,
        ]),
      ].filter(
        (index): index is number =>
          index !== undefined && index >= 0 && !!cell(index),
      );
      if (!dateCells.length) throw new Error("Falta la fecha");
      if (cell(c.time) && !cell(c.date))
        throw new Error("La hora principal necesita una fecha principal.");
      if (cell(c.secondaryTime) && !cell(c.secondaryDate))
        throw new Error("La hora secundaria necesita una fecha secundaria.");
      const dates = movementDateRange(
        dateCells.map((index) =>
          sourceDateTime(
            cell(index),
            profile.dateFormat,
            index === c.secondaryDate
              ? cell(c.secondaryTime)
              : index === c.date
                ? cell(c.time)
                : "",
          ),
        ),
      );
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
      const text = normalizeImportedText({
        description: cell(c.description),
        merchant: cell(c.merchant),
        reference: cell(c.reference),
        notes: cell(c.notes),
        fallback: profile.bank === "n26" ? cell(c.type) : undefined,
        namedCounterparty:
          profile.bank === "revolut" &&
          ["TARJETA", "PAGO CON TARJETA", "CARD", "CARD_PAYMENT"].includes(
            cell(c.type).toUpperCase(),
          ),
      });
      const notes: string[] = text.notes ? [text.notes] : [];
      const originalCurrency =
        cell(c.originalCurrency).toUpperCase() || undefined;
      if (
        (cell(c.originalAmount) || originalCurrency) &&
        (!cell(c.originalAmount) ||
          !originalCurrency ||
          !/^[A-Z]{3}$/.test(originalCurrency))
      )
        throw new Error(
          "El importe original y su moneda deben indicarse juntos y ser válidos",
        );
      const originalAmount = originalCurrency
        ? parseAmount(
            cell(c.originalAmount).replace(
              new RegExp(originalCurrency, "gi"),
              "",
            ),
            profile.decimal,
            originalCurrency,
          )
        : undefined;
      if (
        originalCurrency &&
        explicitCurrencies(cell(c.originalAmount)).some(
          (code) => code !== originalCurrency,
        )
      )
        throw new Error(
          "El importe original contiene una moneda distinta a la indicada",
        );
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
      if (/[$¥]/.test(cell(c.fee)))
        throw new Error("La comisión contiene un símbolo de moneda ambiguo");
      if (cell(c.fee).includes("£") && currency !== "GBP")
        throw new Error(
          "La moneda de la comisión no coincide con la del movimiento",
        );
      const fee = cell(c.fee)
        ? parseAmount(
            cell(c.fee).replace(new RegExp(currency, "gi"), ""),
            profile.decimal,
            currency,
          )
        : undefined;
      const exchangeRate = parseExchangeRate(cell(c.exchangeRate));
      // Only the raw Revolut CSV amount excludes its separate fee. Our CSV and
      // normalized PDF already contain the net amount, including any fee.
      if (profile.bank === "revolut") amount -= fee ?? 0;
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
        description: text.description,
        reference: text.reference,
        merchant: text.merchant,
        ...dates,
        categorySource: "none",
        tagIds: [],
        notes: notes.join("\n"),
        originalAmount,
        originalCurrency,
        fee,
        exchangeRate,
        source,
        fingerprint: "",
        createdAt: new Date().toISOString(),
      };
      validateOriginalAmount(m);
      if (cell(c.balanceSource)) {
        if (cell(c.balanceSource) !== "Calculado" || m.balance === undefined)
          throw new Error("Origen del saldo no válido");
        m.balanceSource = "calculated";
      }
      validateMovementCosts(m);
      m.fingerprint = fingerprint(m);
      const sourceDates = [
        c.date,
        c.valueDate,
        c.bookingDate,
        c.completionDate,
        c.secondaryDate,
      ].map((index) => {
        if (!cell(index)) return "";
        const value = sourceDateTime(
          cell(index),
          profile.dateFormat,
          index === c.secondaryDate
            ? cell(c.secondaryTime)
            : index === c.date
              ? cell(c.time)
              : "",
        );
        return value.date + (value.time ? `T${value.time}` : "");
      });
      candidates.push({
        movement: m,
        row: rowNumber,
        sourceDates,
        ...duplicateOfSaved(m),
      });
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
  for (const m of existing) {
    const key = fingerprint(m);
    byContent.set(key, [...(byContent.get(key) || []), m]);
  }
  return (
    m: Movement,
  ): Pick<Candidate, "duplicate" | "selected" | "balanceMissing"> => {
    const matches = byContent.get(fingerprint(m)) || [];
    if (
      m.balance !== undefined &&
      !m.balanceSource &&
      matches.some((old) => !old.balanceSource && old.balance === m.balance)
    )
      return { duplicate: "possible", selected: false };
    // Older imports may lack a balance. Flag the uncertainty without dropping a row.
    if (
      matches.some(
        (old) =>
          old.balance === undefined ||
          m.balance === undefined ||
          !!old.balanceSource ||
          !!m.balanceSource,
      )
    )
      return { duplicate: "possible", selected: true, balanceMissing: true };
    return { duplicate: "none", selected: true };
  };
}
