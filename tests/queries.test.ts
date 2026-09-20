import { expect, it } from "vitest";
import { validateQuery, executeQuery } from "../src/features/ai/queries";
import { emptySnapshot } from "../src/data/types";
it("rechaza acciones, código y referencias inventadas", () => {
  const data = emptySnapshot();
  expect(() =>
    validateQuery({ op: "delete", sql: "DROP TABLE movements" }, data),
  ).toThrow();
  expect(() =>
    validateQuery({ op: "search", accountId: "inventada" }, data),
  ).toThrow();
  expect(validateQuery({ op: "sum" }, data).op).toBe("clarify");
});
it("calcula resultados por moneda sin mezclar importes", () => {
  const data = emptySnapshot();
  data.movements = [
    {
      id: "a",
      amount: -1200,
      currency: "EUR",
      date: "2026-09-01",
      description: "Café",
    },
    {
      id: "b",
      amount: -300,
      currency: "USD",
      date: "2026-09-02",
      description: "Café",
    },
  ] as any;
  const r = executeQuery(
    { op: "sum", from: "2026-09-01", to: "2026-09-30" },
    data,
  );
  expect(r.text).toContain("EUR");
  expect(r.text).toContain("USD");
  expect(r.text).toContain("12,00");
  expect(r.text).toContain("3,00");
});
it("compara ingresos y referencia también el período anterior aunque el actual esté vacío", () => {
  const data = emptySnapshot();
  data.movements = [
    {
      id: "a",
      amount: 120000,
      currency: "EUR",
      date: "2026-08-01",
      description: "Nómina",
    },
  ] as any;
  const r = executeQuery(
    {
      op: "compare",
      direction: "income",
      from: "2026-09-01",
      to: "2026-09-30",
      comparisonFrom: "2026-08-01",
      comparisonTo: "2026-08-31",
    },
    data,
  );
  expect(r.text).toContain("ingresos");
  expect(r.text).toContain("1200,00");
  expect(r.rows.map((m) => m.id)).toEqual(["a"]);
  expect(() =>
    validateQuery({ op: "search", from: "2026-02-31" }, data),
  ).toThrow();
});
