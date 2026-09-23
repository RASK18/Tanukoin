import type { Account, Movement } from "../../data/types";
import { detectImport } from "./detect";
import { buildCandidates } from "./parse";
import type { Candidate, DetectedLayout, ParsedFile } from "./types";

export function prepareImport(
  file: ParsedFile,
  account: Account,
  indices: number[],
  overrides: Record<number, DetectedLayout> = {},
  existing: Movement[] = [],
) {
  const candidates: Candidate[] = [],
    errors: string[] = [],
    warnings = [...file.warnings],
    unknown: number[] = [];
  let informational = 0;
  for (const index of indices) {
    const sheet = file.sheets[index];
    if (!sheet) continue;
    if (sheet.informational) {
      informational++;
      continue;
    }
    warnings.push(...(sheet.warnings || []).map((w) => `${sheet.name}: ${w}`));
    const detected = detectImport({ ...file, sheets: [sheet] });
    if (!overrides[index] && !detected.complete) {
      unknown.push(index);
      errors.push(
        `${sheet.name}: formato no reconocido. Puedes intentar reconocerlo con IA local o elegir otro archivo.`,
      );
      continue;
    }
    const result = buildCandidates(
      sheet.rows,
      overrides[index] || detected.layout,
      account,
      file.name,
      existing,
    );
    candidates.push(
      ...result.candidates.map((c) => ({
        ...c,
        sheet: sheet.name,
        page: sheet.page,
      })),
    );
    errors.push(...result.errors.map((e) => `${sheet.name}: ${e}`));
    warnings.push(...result.warnings.map((w) => `${sheet.name}: ${w}`));
    if (
      !result.candidates.length &&
      !result.errors.length &&
      !result.warnings.length
    )
      errors.push(
        `${sheet.name}: no se han reconocido movimientos. Comprueba esta página o elige otro archivo.`,
      );
  }
  return { candidates, errors, warnings, unknown, informational };
}
