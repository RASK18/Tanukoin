import { expect, it } from "vitest";
import { buildCandidates, defaultProfile } from "../src/features/import/parse";
const account = { id: "a", name: "Cuenta", bank: "", currency: "EUR" };
it("no confunde coincidencias de importe con duplicados exactos", () => {
  const rows = [
    ["Fecha", "Concepto", "Importe"],
    ["15/09/2026", "Café", "-2,50"],
    ["15/09/2026", "Café", "-2,50"],
  ];
  const first = buildCandidates(rows, defaultProfile, account, "test.csv", []);
  expect(first.candidates.map((c) => c.duplicate)).toEqual([
    "none",
    "possible",
  ]);
  expect(first.candidates[1].selected).toBe(false);
  const second = buildCandidates(
    rows,
    defaultProfile,
    account,
    "test.csv",
    first.candidates.map((c) => c.movement),
  );
  expect(second.candidates[0].duplicate).toBe("possible");
});
it("reconoce identificadores bancarios y reporta errores por fila", () => {
  const profile = {
    ...defaultProfile,
    columns: { ...defaultProfile.columns, externalId: 3 },
  };
  const result = buildCandidates(
    [
      ["fecha", "concepto", "importe", "id"],
      ["15/09/2026", "Compra", "-1,00", "same"],
      ["15/09/2026", "Compra distinta", "-2,00", "same"],
      ["31/02/2026", "Error", "1,00", "other"],
    ],
    profile,
    account,
    "test",
    [],
  );
  expect(result.candidates[1].duplicate).toBe("exact");
  expect(result.errors).toHaveLength(1);
});
