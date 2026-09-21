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
  expect(first.candidates.map((c) => c.duplicate)).toEqual(["none", "none"]);
  expect(first.candidates[1].selected).toBe(true);
  const second = buildCandidates(
    rows,
    defaultProfile,
    account,
    "test.csv",
    first.candidates.map((c) => c.movement),
  );
  expect(second.candidates[0].duplicate).toBe("possible");
  expect(second.candidates[0].selected).toBe(true); // No balance: keep for review.
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
  expect(result.candidates[1].duplicate).toBe("none");
  const repeated = buildCandidates(
    [
      ["fecha", "concepto", "importe", "id"],
      ["15/09/2026", "Compra", "-1,00", "same"],
    ],
    profile,
    account,
    "test",
    result.candidates.map((c) => c.movement),
  );
  expect(repeated.candidates[0].duplicate).toBe("exact");
  expect(result.errors).toHaveLength(1);
});

it("compara fecha, importe, concepto y saldo solo con movimientos guardados de la misma cuenta", () => {
  const profile = {
    ...defaultProfile,
    columns: { ...defaultProfile.columns, balance: 3 },
  };
  const rows = [
    ["Fecha", "Concepto", "Importe", "Saldo"],
    ["02/01/2026", "Redondeo", "-4,90", "100,00"],
    ["02/01/2026", "Redondeo", "-4,90", "95,10"],
    ["02/01/2026", "Redondeo", "-4,90", "95,10"],
  ];
  const first = buildCandidates(rows, profile, account, "test.pdf", []);
  expect(
    first.candidates.every((c) => c.selected && c.duplicate === "none"),
  ).toBe(true);
  expect(first.candidates.map((c) => c.movement.balance)).toEqual([
    10000, 9510, 9510,
  ]);
  const second = buildCandidates(rows, profile, account, "test.pdf", [
    first.candidates[0].movement,
  ]);
  expect(second.candidates.map((c) => c.duplicate)).toEqual([
    "possible",
    "none",
    "none",
  ]);
  expect(second.candidates.map((c) => c.selected)).toEqual([false, true, true]);
  const otherAccount = buildCandidates(
    rows,
    profile,
    { ...account, id: "b" },
    "test.pdf",
    first.candidates.map((c) => c.movement),
  );
  expect(otherAccount.candidates.every((c) => c.duplicate === "none")).toBe(
    true,
  );
});
