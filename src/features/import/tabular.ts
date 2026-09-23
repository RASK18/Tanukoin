import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ParsedFile } from "./types";

export function readTabular(buffer: ArrayBuffer, name: string): ParsedFile {
  const extension = name.split(".").pop()?.toLowerCase();
  const result: ParsedFile = { name, kind: "table", sheets: [], warnings: [] };
  let text = new TextDecoder("utf-8").decode(buffer);
  if (
    extension === "csv" ||
    extension === "tsv" ||
    /^\s*<(?:!doctype|html|table)/i.test(text)
  ) {
    if (text.includes("\uFFFD"))
      text = new TextDecoder("windows-1252").decode(buffer);
    text = text.trimStart();
  }
  if (extension === "csv" || extension === "tsv") {
    const parsed = Papa.parse<string[]>(text, {
      delimiter: extension === "tsv" ? "\t" : "",
      skipEmptyLines: "greedy",
    });
    result.sheets = [{ name: "Datos", rows: parsed.data }];
    result.warnings = parsed.errors.map(
      (e) => `Fila ${(e.row ?? 0) + 1}: ${e.message}`,
    );
  } else {
    const html = /^<(?:!doctype|html|table)/i.test(text);
    // The string is parsed, never mounted in the DOM or evaluated.
    const workbook = html
      ? XLSX.read(text, { type: "string", raw: true })
      : XLSX.read(buffer, { type: "array", cellDates: false, cellNF: true });
    result.sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
        dateNF: "yyyy-mm-dd",
      });
      // Numeric Excel dates carry their own calendar, independent of locale and timezone.
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      for (const [address, cell] of Object.entries(sheet)) {
        if (
          address.startsWith("!") ||
          cell.t !== "n" ||
          !cell.z ||
          !XLSX.SSF.is_date(cell.z)
        )
          continue;
        const date = XLSX.SSF.parse_date_code(cell.v, {
          date1904: workbook.Workbook?.WBProps?.date1904,
        });
        if (!date) continue;
        const position = XLSX.utils.decode_cell(address);
        const row = rows[position.r - range.s.r];
        if (!row) continue;
        const pad = (n: number) => String(n).padStart(2, "0");
        let value = `${date.y}-${pad(date.m)}-${pad(date.d)}`;
        if (
          cell.v % 1 ||
          /[hs]/i.test(cell.z.replace(/"[^"]*"|\[[^\]]*\]/g, ""))
        ) {
          value += ` ${pad(date.H)}:${pad(date.M)}:${pad(date.S)}`;
          if (date.u) value += date.u.toFixed(6).slice(1).replace(/0+$/, "");
        }
        row[position.c - range.s.c] = value;
      }
      return { name, rows };
    }).filter((s) => s.rows.some((r) => r.some(Boolean)));
  }
  if (!result.sheets.length)
    throw new Error("El archivo no contiene tablas con datos.");
  return result;
}
