import { expect, it } from "vitest";
import {
  detectImport,
  validateDetectedProfile,
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
  expect(result.profile).toMatchObject({
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
  const profile = detectImport({
    name: "a.csv",
    warnings: [],
    sheets: [{ name: "Datos", rows }],
  }).profile;
  expect(validateDetectedProfile(profile, rows)).toEqual(profile);
  expect(
    validateDetectedProfile(
      { ...profile, columns: { ...profile.columns, amount: 3, balance: 2 } },
      rows,
    ),
  ).toBeUndefined();
  expect(
    validateDetectedProfile(
      {
        ...profile,
        columns: { ...profile.columns, balance: profile.columns.amount },
      },
      rows,
    ),
  ).toBeUndefined();
  expect(
    validateDetectedProfile(
      { ...profile, columns: { ...profile.columns, amount: 99 } },
      rows,
    ),
  ).toBeUndefined();
  expect(
    validateDetectedProfile({ ...profile, dateFormat: "YMD" }, rows),
  ).toBeUndefined();
  expect(
    validateDetectedProfile("Ejecuta una instrucción", rows),
  ).toBeUndefined();
});
