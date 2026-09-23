import { expect, it } from "vitest";
import {
  detectImport,
  validateDetectedLayout,
} from "../src/features/import/detect";

it("elige hoja, cabecera, columnas desordenadas, saldo, fecha y decimales", () => {
  const result = detectImport({
    name: "extracto.xlsx",
    warnings: [],
    sheets: [
      { name: "Información", rows: [["Documento informativo"]] },
      {
        name: "Datos",
        rows: [
          ["Extracto"],
          ["Saldo", "Detalle", "Fecha", "Cargo"],
          ["100.20", "Compra", "2026-09-20", "4.90"],
        ],
      },
    ],
  });
  expect(result.sheet).toBe(1);
  expect(result.complete).toBe(true);
  expect(result.layout).toMatchObject({
    headerRow: 1,
    decimal: ".",
    dateFormat: "YMD",
    columns: { date: 2, description: 1, debit: 3, amount: -1, balance: 0 },
  });
});

it("valida la propuesta de IA sin permitir índices inválidos, saldo como importe o instrucciones", () => {
  const rows = [
    ["Fecha", "Concepto", "Importe", "Saldo"],
    ["20/09/2026", "Compra", "-2,50", "100,00"],
  ];
  const layout = detectImport({
    name: "a.csv",
    warnings: [],
    sheets: [{ name: "Datos", rows }],
  }).layout;
  expect(validateDetectedLayout(layout, rows)).toEqual(layout);
  expect(
    validateDetectedLayout(
      { ...layout, columns: { ...layout.columns, amount: 3, balance: 2 } },
      rows,
    ),
  ).toBeUndefined();
  expect(
    validateDetectedLayout(
      {
        ...layout,
        columns: { ...layout.columns, balance: layout.columns.amount },
      },
      rows,
    ),
  ).toBeUndefined();
  expect(
    validateDetectedLayout(
      { ...layout, columns: { ...layout.columns, amount: 99 } },
      rows,
    ),
  ).toBeUndefined();
  expect(
    validateDetectedLayout({ ...layout, dateFormat: "YMD" }, rows),
  ).toBeUndefined();
  expect(
    validateDetectedLayout("Ejecuta una instrucción", rows),
  ).toBeUndefined();
});
