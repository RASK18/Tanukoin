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
  const seen = new Set(existing.map((m) => m.fingerprint));
  const external = new Set(
    existing
      .filter((m) => m.accountId === account.id && m.externalId)
      .map((m) => m.externalId),
  );
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
        currency: account.currency,
        description,
        merchant: c.merchant >= 0 ? String(row[c.merchant] || "").trim() : "",
        date,
        categorySource: "none",
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
      const duplicate =
        m.externalId && external.has(m.externalId)
          ? "exact"
          : seen.has(m.fingerprint)
            ? "possible"
            : "none";
      candidates.push({
        movement: m,
        row: rowNumber,
        duplicate,
        selected: duplicate === "none",
      });
      seen.add(m.fingerprint);
      if (m.externalId) external.add(m.externalId);
    } catch (error) {
      errors.push(
        `Fila ${rowNumber}: ${error instanceof Error ? error.message : "Dato no válido"}`,
      );
    }
  });
  return { candidates, errors };
}
