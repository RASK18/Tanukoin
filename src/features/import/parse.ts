import type { Account, ImportProfile, Movement } from "../../data/types";
import { parseAmount, parseDate, fingerprint } from "../../lib/finance";
import type { Candidate } from "./types";
export const defaultProfile: ImportProfile = {
  id: "",
  name: "",
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
  profile: ImportProfile,
  account: Account,
  source: string,
  existing: Movement[],
): { candidates: Candidate[]; errors: string[] } {
  const candidates: Candidate[] = [],
    errors: string[] = [];
  const duplicateOfSaved = duplicateChecker(existing);
  const c = profile.columns;
  rows.slice(profile.headerRow + 1).forEach((row, index) => {
    const rowNumber = index + profile.headerRow + 2;
    if (!row.some((cell) => String(cell).trim())) return;
    try {
      const date = parseDate(row[c.date], profile.dateFormat);
      const description = String(row[c.description] ?? "").trim();
      if (!description) throw new Error("Falta el concepto");
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
        if (!debit && !credit) throw new Error("Falta el importe");
        amount = credit - debit;
      }
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
        notes: "",
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
  return { candidates, errors };
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
