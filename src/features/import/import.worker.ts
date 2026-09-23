import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ParsedFile } from "./types";
import { readTabular } from "./tabular";
import { readPdfPage, type PdfContext } from "./pdf-reader";
import type { PdfText } from "./pdf-table";

self.onmessage = async (event: MessageEvent<{ file: File }>) => {
  const { file } = event.data;
  try {
    if (file.size > 100 * 1024 * 1024)
      throw new Error(
        "El archivo supera 100 MB. Divídelo en períodos más pequeños.",
      );
    const extension = file.name.split(".").pop()?.toLowerCase();
    const buffer = await file.arrayBuffer();
    if (["csv", "tsv", "xlsx", "xls"].includes(extension || "")) {
      self.postMessage({ result: readTabular(buffer, file.name) });
      return;
    }
    if (extension !== "pdf")
      throw new Error("Utiliza un archivo CSV, XLS, XLSX o PDF con texto.");
    const port = new Worker(pdfWorkerUrl, { type: "module" });
    pdfjs.GlobalWorkerOptions.workerPort = port;
    const base = `${self.location.origin}${import.meta.env.BASE_URL}pdf/`;
    const task = pdfjs.getDocument({
      data: buffer,
      useWorkerFetch: true,
      disableFontFace: true,
      useSystemFonts: true,
      wasmUrl: `${base}wasm/`,
      standardFontDataUrl: `${base}standard_fonts/`,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
    });
    try {
      const doc = await task.promise;
      const result: ParsedFile = {
        name: file.name,
        kind: "pdf",
        sheets: [],
        warnings: [],
      };
      const context: PdfContext = {};
      let textItems = 0;
      for (let page = 1; page <= doc.numPages; page++) {
        const content = await (await doc.getPage(page)).getTextContent();
        const items: PdfText[] = content.items.flatMap((item) =>
          "str" in item && item.str.trim()
            ? [
                {
                  x: item.transform[4],
                  y: item.transform[5],
                  width: item.width,
                  text: item.str,
                },
              ]
            : [],
        );
        textItems += items.length;
        result.sheets.push(readPdfPage(items, page, context));
        self.postMessage({ progress: page / doc.numPages });
      }
      if (!textItems)
        throw new Error(
          "Este PDF no contiene texto extraíble. Utiliza CSV, Excel o un PDF digital; no se realiza OCR.",
        );
      result.normalizedPdf = context.recognized;
      self.postMessage({ result });
    } finally {
      await task.destroy();
      port.terminate();
    }
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "No se pudo leer el archivo",
    });
  }
};
