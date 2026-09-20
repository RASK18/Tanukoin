import Papa from "papaparse";
import * as XLSX from "xlsx";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ParsedFile, Sheet } from "./types";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
self.onmessage = async (
  event: MessageEvent<{ file: File; delimiter?: string }>,
) => {
  const { file, delimiter } = event.data;
  try {
    if (file.size > 100 * 1024 * 1024)
      throw new Error(
        "El archivo supera 100 MB. Divídelo en períodos más pequeños.",
      );
    const extension = file.name.split(".").pop()?.toLowerCase();
    const result: ParsedFile = { name: file.name, sheets: [], warnings: [] };
    if (extension === "csv" || extension === "tsv") {
      const buffer = await file.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buffer);
      if (text.includes("\uFFFD")) {
        text = new TextDecoder("windows-1252").decode(buffer);
        result.warnings.push(
          "Se ha detectado codificación Windows-1252. Revisa los caracteres.",
        );
      }
      const parsed = Papa.parse<string[]>(text, {
        delimiter: delimiter || (extension === "tsv" ? "\t" : ""),
        skipEmptyLines: "greedy",
      });
      result.sheets = [{ name: "Datos", rows: parsed.data }];
      result.warnings.push(
        ...parsed.errors.map((e) => `Fila ${(e.row ?? 0) + 1}: ${e.message}`),
      );
    } else if (["xlsx", "xls"].includes(extension || "")) {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
      });
      result.sheets = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name], {
          header: 1,
          raw: false,
          defval: "",
        }),
      }));
    } else if (extension === "pdf") {
      // Supplying the port avoids PDF.js's DOM-based worker discovery in this worker.
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, {
        type: "module",
      });
      const base = `${self.location.origin}${import.meta.env.BASE_URL}pdf/`;
      const doc = await pdfjs.getDocument({
        data: await file.arrayBuffer(),
        useWorkerFetch: true,
        disableFontFace: true,
        useSystemFonts: true,
        wasmUrl: `${base}wasm/`,
        standardFontDataUrl: `${base}standard_fonts/`,
        cMapUrl: `${base}cmaps/`,
        cMapPacked: true,
      }).promise;
      for (let page = 1; page <= doc.numPages; page++) {
        const p = await doc.getPage(page),
          content = await p.getTextContent();
        const lines = new Map<
          number,
          { x: number; text: string; width: number }[]
        >();
        for (const item of content.items)
          if ("str" in item && item.str.trim()) {
            const y = Math.round(item.transform[5] / 3) * 3;
            lines.set(y, [
              ...(lines.get(y) || []),
              { x: item.transform[4], text: item.str, width: item.width },
            ]);
          }
        const rows = [...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, items]) => {
            const cells: { text: string; end: number }[] = [];
            for (const item of items.sort((a, b) => a.x - b.x)) {
              const last = cells.at(-1);
              if (last && item.x - last.end < 12) {
                last.text += " " + item.text;
                last.end = item.x + item.width;
              } else cells.push({ text: item.text, end: item.x + item.width });
            }
            return cells.map((c) => c.text);
          });
        result.sheets.push({
          name: `Página ${page}`,
          page,
          rows,
        } satisfies Sheet);
        self.postMessage({ progress: page / doc.numPages });
      }
      await doc.destroy();
      if (!result.sheets.some((s) => s.rows.length))
        throw new Error(
          "Este PDF no contiene texto extraíble. Parece escaneado: utiliza CSV, Excel o un PDF digital.",
        );
      result.warnings.push(
        "PDF: selecciona las páginas, revisa las columnas y corrige las filas partidas antes de importar.",
      );
    } else
      throw new Error("Utiliza un archivo CSV, XLS, XLSX o PDF con texto.");
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "No se pudo leer el archivo",
    });
  }
};
