import { expect, it } from "vitest";
import {
  detectStatementColumns,
  statementRows,
  type PdfText,
} from "../src/features/import/pdf-table";
import { buildCandidates, defaultLayout } from "../src/features/import/parse";

const text = (x: number, y: number, text: string, width = 30): PdfText => ({
  x,
  y,
  text,
  width,
});
const header = [
  text(89, 570, "FE.ANOTAC", 43),
  text(139, 570, "IMPORTE", 35),
  text(190, 570, "SALDO", 25),
  text(347, 570, "CONCEPTO", 41),
];
const columns = detectStatementColumns(header)!;
const account = { id: "a", name: "Cuenta", bank: "", currency: "EUR" };

it("reconstruye conceptos anteriores a la fecha y separa saldo e importe", () => {
  const rows = statementRows(
    [
      text(230, 650, "Titular y datos del certificado"),
      ...header,
      text(230, 558, "COMPRA EN COMERCIO"),
      text(350, 547, "DE EJEMPLO"),
      text(89, 547, "19/09/2026"),
      text(145, 547, "-12,30"),
      text(190, 547, "987,70"),
      text(230, 535, "ABONO"),
      text(89, 524, "18/09/2026"),
      text(145, 524, "20,00"),
      text(190, 524, "1000,00"),
      text(350, 524, "DEVOLUCION"),
      text(230, 500, "Firma y pie del certificado"),
    ],
    columns,
  );
  expect(rows).toEqual([
    ["Fecha", "Concepto", "Importe", "Saldo"],
    ["19/09/2026", "COMPRA EN COMERCIO DE EJEMPLO", "-12,30", "987,70"],
    ["18/09/2026", "ABONO DEVOLUCION", "20,00", "1000,00"],
  ]);
  const result = buildCandidates(
    rows,
    defaultLayout,
    account,
    "ficticio.pdf",
    [],
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates.map((c) => c.movement.amount)).toEqual([
    -1230, 2000,
  ]);
});

it("conserva la primera fila sin cabecera, coincidencias y filas incompletas", () => {
  const rows = statementRows(
    [
      text(230, 780, "COMPRA"),
      text(89, 769, "17/09/2026"),
      text(145, 769, "-2,50"),
      text(190, 769, "10,00"),
      text(350, 769, "CAFE"),
      text(230, 758, "COMPRA"),
      text(89, 747, "17/09/2026"),
      text(145, 747, "-2,50"),
      text(190, 747, "12,50"),
      text(350, 747, "CAFE"),
      text(89, 725, "16/09/2026"),
      text(230, 725, "Falta importe"),
    ],
    columns,
  );
  const result = buildCandidates(
    rows,
    defaultLayout,
    account,
    "ficticio.pdf",
    [],
  );
  expect(result.candidates).toHaveLength(2);
  expect(result.candidates.map((c) => c.duplicate)).toEqual(["none", "none"]);
  expect(result.errors).toHaveLength(1);
  expect(
    detectStatementColumns([
      text(40, 700, "Fecha"),
      text(170, 700, "Concepto"),
    ]),
  ).toBeUndefined();
});
