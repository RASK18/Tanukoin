import type { Account, Movement } from "../../data/types";
import { detectImport } from "./detect";
import { buildCandidates } from "./parse";
import type { Candidate, DetectedLayout, ParsedFile } from "./types";
import { inferSourceOrder } from "../../lib/movement-order";

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
  let previousSheet = -1;
  for (const index of [...new Set(indices)].sort((a, b) => a - b)) {
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
    const offset = file.sheets
      .slice(0, index)
      .reduce((sum, s) => sum + s.rows.length, 0);
    const before = candidates.at(-1);
    const layout = overrides[index] || detected.layout;
    candidates.push(
      ...result.candidates.map((c, i) => ({
        ...c,
        issues: sheet.issues?.filter((issue) => issue.row === c.row),
        movement: {
          ...c.movement,
          sourcePosition: {
            sheet: sheet.name,
            page: sheet.page,
            row: c.row,
            position: offset + c.row,
            previousPosition:
              i > 0 && result.candidates[i - 1].row === c.row - 1
                ? offset + c.row - 1
                : i === 0 &&
                    before &&
                    previousSheet === index - 1 &&
                    before.row === file.sheets[previousSheet].rows.length &&
                    c.row === layout.headerRow + 2
                  ? before.movement.sourcePosition?.position
                  : undefined,
          },
        },
        sheet: sheet.name,
        page: sheet.page,
      })),
    );
    previousSheet = index;
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
  const ordered = inferSourceOrder(
    candidates.map((c) => c.movement),
    new Set(),
    new Map(candidates.map((c) => [c.movement.id, c.sourceDates || []])),
  );
  return {
    hasSourceBalances: file.sheets.some((s, i) => {
      const layout =
        overrides[i] || detectImport({ ...file, sheets: [s] }).layout;
      const col = layout.columns.balance ?? -1;
      return (
        col >= 0 &&
        s.rows.slice(layout.headerRow + 1).some((row) => !!row[col]?.trim())
      );
    }),
    candidates: candidates.map((c, i) => ({ ...c, movement: ordered[i] })),
    errors,
    warnings,
    unknown,
    informational,
  };
}
