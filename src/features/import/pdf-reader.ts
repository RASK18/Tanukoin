import { normalize, parseDate } from "../../lib/finance";
import {
  detectStatementColumns,
  statementRows,
  type PdfText,
} from "./pdf-table";
import type { Sheet } from "./types";

const headers = [
  "Fecha",
  "Concepto",
  "Importe",
  "Saldo",
  "Fecha valor",
  "Fecha contable",
  "Notas",
  "Moneda",
];
const months = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const dateLike = (text: string) =>
  /^(?:\d{1,4}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+\p{L}+\.?\s+\d{4})$/u.test(
    text.trim(),
  );
export function pdfDate(text: string): string | undefined {
  const value = normalize(text).replace(/\./g, "/");
  const words = value.match(/^(\d{1,2})\s+(\p{L}+)\/?\s+(\d{4})$/u);
  const month = words
    ? months.indexOf(words[2].slice(0, 3).replace("set", "sep")) + 1
    : 0;
  const numeric = words && month ? `${words[1]}/${month}/${words[3]}` : value;
  if (!/^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}$/.test(numeric)) return;
  try {
    return parseDate(numeric, "DMY");
  } catch {
    return;
  }
}

const ordered = (items: PdfText[]) =>
  [...items].sort((a, b) => (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y));
const join = (items: PdfText[]) =>
  ordered(items)
    .map((i) => i.text.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Retain unknown rows for explicit recognition/AI rather than dropping them. */
export function pdfLines(items: PdfText[]): string[][] {
  const lines: { y: number; items: PdfText[] }[] = [];
  for (const item of ordered(items)) {
    const line = lines.find((l) => Math.abs(l.y - item.y) < 2);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines.map((line) => {
    const cells: { text: string; end: number }[] = [];
    for (const i of line.items.sort((a, b) => a.x - b.x)) {
      const last = cells.at(-1);
      if (last && i.x - last.end < 12) {
        last.text += " " + i.text;
        last.end = i.x + i.width;
      } else cells.push({ text: i.text, end: i.x + i.width });
    }
    return cells.map((c) => c.text);
  });
}

export interface PdfContext {
  certificate?: ReturnType<typeof detectStatementColumns>;
  recognized?: boolean;
  currency?: string;
}

export function readPdfPage(
  items: PdfText[],
  page: number,
  context: PdfContext,
): Sheet {
  const sheet: Sheet = { name: `Página ${page}`, page, rows: [], warnings: [] };
  const named = (text: string) => items.find((i) => normalize(i.text) === text);
  const description = named("descripcion") || named("concepto");
  const currency =
    items
      .map((i) => i.text)
      .join(" ")
      .match(/Extracto en ([A-Z]{3})/)?.[1] ||
    items
      .find(
        (i) => /\b(EUR|USD|GBP|CHF|JPY)\b/.test(i.text) && i.text.length < 30,
      )
      ?.text.match(/\b(EUR|USD|GBP|CHF|JPY)\b/)?.[1] ||
    context.currency;
  if (currency) context.currency = currency;
  sheet.currency = currency;
  const near = (text: string) =>
    description &&
    items.find(
      (i) => normalize(i.text) === text && Math.abs(i.y - description.y) < 12,
    );
  const outgoing = near("dinero saliente"),
    incoming = near("dinero entrante"),
    balance = near("saldo");
  const booking = near("fecha de reserva");
  const amount =
    description &&
    items.find(
      (i) =>
        /^(?:importe|cantidad)(?:\s|$)/.test(normalize(i.text)) &&
        Math.abs(i.y - description.y) < 3,
    );
  const value = near("fecha valor") || near("fecha de valor");
  const dateHeader =
    description &&
    items.find(
      (i) =>
        /^fecha(?:$| de la$| operacion$)/.test(normalize(i.text)) &&
        Math.abs(i.y - description.y) < 12,
    );
  const revolut = !!(description && outgoing && incoming && balance);
  const n26 = !!(description && booking && amount);
  const table = !!(description && amount && dateHeader);
  if (revolut || n26 || table) {
    const h = description!;
    const dateX = n26
      ? booking!.x
      : (dateHeader?.x ??
        Math.min(
          ...items
            .filter((i) => i.y <= h.y + 12 && i.y >= h.y - 12)
            .map((i) => i.x),
        ));
    const dateRight = n26
      ? amount!.x - 15
      : (value?.x ?? (revolut ? h.x : h.x - 40));
    const dates = ordered(
      items.filter(
        (i) =>
          i.y < h.y - 8 &&
          i.x >= dateX - 12 &&
          i.x < dateRight &&
          dateLike(i.text),
      ),
    );
    const descriptionLeft =
      n26 || revolut ? h.x - 3 : value ? value.x + value.width + 3 : dateRight;
    const descriptionRight = n26
      ? booking!.x - 5
      : revolut
        ? outgoing!.x - 5
        : amount!.x - 8;
    const balanceLeft = balance
      ? (amount
          ? amount.x + amount.width + balance.x
          : incoming!.x + incoming!.width + balance.x) / 2
      : Infinity;
    sheet.rows = [headers];
    dates.forEach((date, index) => {
      const sameLine = (left: number, right: number) =>
        join(
          items.filter(
            (i) => i.x >= left && i.x < right && Math.abs(i.y - date.y) < 3,
          ),
        );
      const top =
        n26 || revolut
          ? date.y + 4
          : index
            ? (dates[index - 1].y + date.y) / 2
            : h.y - 3;
      const bottom =
        n26 || revolut
          ? dates[index + 1]
            ? dates[index + 1].y + 4
            : date.y - (n26 ? 90 : 45)
          : dates[index + 1]
            ? (dates[index + 1].y + date.y) / 2
            : date.y - 15;
      const detail = ordered(
        items.filter(
          (i) =>
            i.x >= descriptionLeft &&
            i.x < descriptionRight &&
            i.y <= top &&
            i.y > bottom,
        ),
      );
      let concept = join(detail),
        notes = "",
        valueDate = "";
      if (n26 || revolut) {
        const firstY = detail[0]?.y ?? date.y;
        concept = join(detail.filter((i) => Math.abs(i.y - firstY) < 3));
        notes = join(detail.filter((i) => Math.abs(i.y - firstY) >= 3));
        if (n26) {
          const secondary = detail.find((i) =>
            /^fecha de valor /i.test(i.text),
          );
          valueDate = secondary
            ? pdfDate(secondary.text.replace(/^fecha de valor\s+/i, "")) || ""
            : "";
        }
      }
      if (value)
        valueDate = pdfDate(sameLine(value.x - 3, descriptionLeft)) || "";
      let signed = "";
      if (revolut) {
        const debit = sameLine(outgoing!.x - 3, incoming!.x - 3);
        const credit = sameLine(incoming!.x - 3, balanceLeft);
        if (debit && credit)
          sheet.warnings!.push(
            `Operación ${index + 1}: contiene entrada y salida simultáneas; revisa el documento.`,
          );
        signed =
          debit && credit
            ? "Entrada y salida simultáneas"
            : debit
              ? `-${debit.replace(/^[-+]/, "")}`
              : credit;
        const foreign = join(
          items.filter(
            (i) =>
              i.x >= outgoing!.x - 3 &&
              i.x < balanceLeft &&
              i.y < date.y - 3 &&
              i.y > bottom,
          ),
        );
        if (foreign)
          notes = [notes, `Información original: ${foreign}`]
            .filter(Boolean)
            .join(". ");
      } else
        signed = sameLine(n26 ? amount!.x - 35 : descriptionRight, balanceLeft);
      const rowCurrency =
        currency || (signed.includes("€") ? "EUR" : undefined);
      sheet.rows.push([
        pdfDate(date.text) || date.text,
        concept || "Sin concepto",
        signed,
        balance ? sameLine(balanceLeft, Infinity) : "",
        valueDate,
        n26 ? pdfDate(date.text) || date.text : "",
        notes,
        rowCurrency || "",
      ]);
    });
    const unpaired = items.filter(
      (i) =>
        i.y < h.y - 8 &&
        i.x >=
          (n26
            ? amount!.x - 35
            : revolut
              ? outgoing!.x - 3
              : descriptionRight) &&
        i.x < balanceLeft &&
        /^[+-]?[\d.,\s]+[.,]\d{1,2}\s*(?:€|EUR|USD|GBP|\$|£)?$/.test(
          i.text.trim(),
        ) &&
        !dates.some((d) => Math.abs(d.y - i.y) < 3) &&
        (!revolut ||
          items.some(
            (b) =>
              b.x >= balanceLeft &&
              Math.abs(b.y - i.y) < 3 &&
              /\d/.test(b.text),
          )),
    );
    for (const item of unpaired)
      sheet.rows.push([
        "",
        "Operación sin fecha reconocida",
        item.text,
        "",
        "",
        "",
        "",
        currency || "",
      ]);
    if (!dates.length)
      sheet.warnings!.push(
        "Se reconoce la tabla, pero no sus fechas. No se han extraído movimientos.",
      );
    context.recognized = true;
    return sheet;
  }
  const certificate = detectStatementColumns(items);
  if (certificate) context.certificate = certificate;
  if (
    context.certificate &&
    items.some(
      (i) => Math.abs(i.x - context.certificate!.dateX) < 5 && pdfDate(i.text),
    )
  ) {
    sheet.rows = statementRows(items, context.certificate);
    context.recognized = true;
    return sheet;
  }
  const money = items.filter((i) =>
    /^[+-]?[\d.,\s]+[.,]\d{2}\s*(€|EUR|USD|GBP|\$|£)?$/.test(i.text.trim()),
  );
  const datedAmount = money.some((m) =>
    items.some((i) => pdfDate(i.text) && Math.abs(i.y - m.y) < 4),
  );
  const summary = !!(
    named("saldo previo") &&
    named("transacciones salientes") &&
    named("transacciones entrantes")
  );
  if (
    context.recognized &&
    items.length > 0 &&
    (summary || (!description && !datedAmount && money.length === 0))
  ) {
    sheet.informational = true;
    return sheet;
  }
  sheet.rows = pdfLines(items);
  return sheet;
}
