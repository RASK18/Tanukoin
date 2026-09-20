import { describe, expect, it } from "vitest";
import {
  parseAmount,
  parseDate,
  totals,
  applyRules,
  recurrenceDate,
  occurrences,
  validateRelation,
} from "../src/lib/finance";
import type { Movement, Rule, Recurrence } from "../src/data/types";
const movement = (
  id: string,
  amount: number,
  extra: Partial<Movement> = {},
): Movement => ({
  id,
  accountId: "a",
  amount,
  currency: "EUR",
  description: "Supermercado",
  merchant: "",
  date: "2026-09-15",
  categorySource: "none",
  notes: "",
  source: "test",
  fingerprint: id,
  createdAt: "2026-09-15",
  ...extra,
});
describe("importes y fechas", () => {
  it("interpreta separadores, signo y monedas sin decimales", () => {
    expect(parseAmount("1.234,56 €", ",")).toBe(123456);
    expect(parseAmount("(12,30)", ",")).toBe(-1230);
    expect(parseAmount("2,340.00", ".")).toBe(234000);
    expect(parseAmount("500", ",", "JPY")).toBe(500);
  });
  it("rechaza importes ambiguos y fechas imposibles", () => {
    expect(() => parseAmount("12.30", ",")).toThrow();
    expect(() => parseAmount("1,234", ",")).toThrow();
    expect(() => parseDate("31/02/2026", "DMY")).toThrow();
    expect(parseDate("29/02/2024", "DMY")).toBe("2024-02-29");
    expect(parseDate("2026-09-15", "DMY")).toBe("2026-09-15");
  });
});
describe("contabilidad", () => {
  it("excluye transferencias y descuenta devoluciones de gastos", () => {
    const rows = [
      movement("pay", -10000),
      movement("refund", 2000),
      movement("out", -5000),
      movement("in", 5000, { accountId: "b" }),
      movement("salary", 200000),
    ];
    const rel = [
      { id: "r", type: "refund" as const, movementIds: ["pay", "refund"] },
      { id: "t", type: "transfer" as const, movementIds: ["out", "in"] },
    ];
    expect(totals(rows, rel)).toEqual({
      income: 200000,
      expense: 8000,
      balance: 192000,
    });
    expect(totals([rows[1]], rel, rows)).toEqual({
      income: 0,
      expense: -2000,
      balance: 2000,
    });
  });
  it("valida transferencias en cuentas y monedas", () => {
    expect(() =>
      validateRelation("transfer", [movement("a", -100), movement("b", 100)]),
    ).toThrow();
    expect(() =>
      validateRelation("transfer", [
        movement("a", -100),
        movement("b", 100, { accountId: "b" }),
      ]),
    ).not.toThrow();
  });
  it("respeta las categorías manuales y primera regla", () => {
    const rules: Rule[] = [
      {
        id: "late",
        name: "Segunda",
        enabled: true,
        priority: 2,
        descriptionContains: "super",
        merchantContains: "",
        note: "",
        categoryId: "b",
      },
      {
        id: "first",
        name: "Primera",
        enabled: true,
        priority: 1,
        descriptionContains: "SUPER",
        merchantContains: "",
        note: "Compra",
        categoryId: "a",
      },
    ];
    expect(applyRules(movement("x", -10), rules).categoryId).toBe("a");
    expect(
      applyRules(
        movement("x", -10, { categorySource: "manual", categoryId: "mine" }),
        rules,
      ).categoryId,
    ).toBe("mine");
  });
});
describe("recurrencias", () => {
  it("conserva el día 31 después de un mes corto", () => {
    expect(recurrenceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(recurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(recurrenceDate("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });
  it("no vuelve a mostrar vencimientos ya avanzados", () => {
    const r: Recurrence = {
      id: "r",
      name: "Alquiler",
      accountId: "a",
      amount: -80000,
      currency: "EUR",
      frequency: "monthly",
      anchorDate: "2026-01-31",
      nextDate: "2026-03-31",
      active: true,
      movementIds: [],
    };
    expect(occurrences(r, "2026-02-01", "2026-04-30")).toEqual([
      "2026-03-31",
      "2026-04-30",
    ]);
  });
});
