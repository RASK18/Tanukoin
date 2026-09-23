import { expect, it } from "vitest";
import { emptySnapshot, type Movement } from "../src/data/types";
import {
  executeQuery,
  validateQuery,
  type QuerySpec,
} from "../src/features/ai/queries";

function fixture(amounts = [1000, 2000, 3000, 4000, 100000]) {
  const data = emptySnapshot();
  data.movements = amounts.map((amount, i): Movement => ({
    id: `m${i}`,
    accountId: "a",
    amount: -amount,
    currency: "EUR",
    date: "2026-09-15",
    description: `Compra ${i}`,
    merchant: "",
    notes: "",
    source: "test",
    fingerprint: `m${i}`,
    tagIds: [],
    categorySource: "none",
    createdAt: "2026-09-15",
  }));
  return data;
}
const base: QuerySpec = {
  op: "mean",
  direction: "expense",
  from: "2026-09-01",
  to: "2026-09-30",
};

it("distingue máximo individual de suma y devuelve todos los empates", () => {
  const data = fixture([1000, 4000, 4000]);
  const result = executeQuery(
    validateQuery({ ...base, op: "max" }, data),
    data,
  );
  expect(result.text).toContain("Máximo 40,00");
  expect(result.rows.map((r) => r.id)).toEqual(["m1", "m2"]);
  expect(
    executeQuery({ ...base, op: "min" }, data).rows.map((r) => r.id),
  ).toEqual(["m0"]);
});
it.each([
  ["mean", undefined, undefined, "220,00", 5],
  ["median", undefined, undefined, "30,00", 5],
  ["mean", "trimmed", "20", "30,00", 3],
  ["median", "trimmed", "20", "30,00", 3],
] as const)(
  "calcula %s %s y referencia solo la muestra usada",
  (op, mode, trimPercent, expected, count) => {
    const data = fixture();
    const query = { ...base, op, ...(mode ? { mode, trimPercent } : {}) };
    const result = executeQuery(validateQuery(query, data), data);
    expect(result.text).toContain(expected);
    expect(result.rows).toHaveLength(count);
    expect(data.movements).toHaveLength(5);
  },
);
it.each(["mean", "median"] as const)(
  "acota %s por límites inclusivos y conserva importes enteros",
  (op) => {
    const data = fixture();
    const result = executeQuery(
      validateQuery(
        { ...base, op, mode: "bounded", minAmount: "2000", maxAmount: "4000" },
        data,
      ),
      data,
    );
    expect(result.text).toContain("30,00");
    expect(result.rows.map((m) => m.amount)).toEqual([-2000, -3000, -4000]);
  },
);
it("redondea medias y medianas pares al céntimo sin alterar datos", () => {
  const data = fixture([100, 101]);
  for (const op of ["mean", "median"] as const)
    expect(executeQuery({ ...base, op }, data).text).toContain("1,01");
  expect(data.movements.map((m) => m.amount)).toEqual([-100, -101]);
});
it("trunca por moneda redondeando el número de filas hacia abajo", () => {
  const data = fixture([100, 200, 300]);
  data.movements[2].currency = "USD";
  const result = executeQuery(
    { ...base, mode: "trimmed", trimPercent: "20" },
    data,
  );
  expect(result.text).toContain("EUR: Media truncada 1,50");
  expect(result.text).toContain("USD: Media truncada 3,00");
  expect(result.text).toContain("Retirados 0 de cada extremo");
});
it("excluye transferencias y devoluciones de estadísticas individuales pero no cambia los totales netos", () => {
  const data = fixture([1000, 3000, -500, 9000]);
  data.relations = [
    { id: "r", type: "refund", movementIds: ["m0", "m2"] },
    { id: "t", type: "transfer", movementIds: ["m3"] },
  ];
  expect(executeQuery(base, data).text).toContain("20,00");
  expect(executeQuery({ ...base, op: "sum" }, data).text).toContain("35,00");
});
it("pide parámetros faltantes y rechaza porcentajes, rangos y modos inválidos", () => {
  const data = fixture();
  for (const extra of [
    { mode: "trimmed" },
    { mode: "bounded" },
    { direction: "all" },
    { from: undefined },
  ]) {
    const query = { ...base, ...extra };
    if (query.from === undefined) delete query.from;
    expect(validateQuery(query, data).op).toBe("clarify");
  }
  for (const extra of [
    { mode: "trimmed", trimPercent: "50" },
    { mode: "trimmed", trimPercent: "-1" },
    { mode: "trimmed", trimPercent: "NaN" },
    { minAmount: "1.5" },
    { minAmount: "9007199254740992" },
    { minAmount: "500", maxAmount: "100" },
    { trimPercent: "10" },
    { op: "search", mode: "trimmed", trimPercent: "10" },
  ])
    expect(() => validateQuery({ ...base, ...extra }, data)).toThrow();
});
it("maneja muestras vacías e ingresos positivos", () => {
  const data = fixture([-1000, -3000]);
  expect(executeQuery(base, data).text).toContain("No hay movimientos");
  expect(executeQuery({ ...base, direction: "income" }, data).text).toContain(
    "20,00",
  );
});
it("busca sinónimos, comercios y categorías sin confundir palabras parciales", () => {
  const data = fixture([100, 200, 300, 400, 500]);
  [
    "Abono salario",
    "Factura luz",
    "Compra Mercadona",
    "Arrendamiento vivienda",
    "Visita diaria",
  ].forEach((description, i) => (data.movements[i].description = description));
  for (const [text, id] of [
    ["nómina", "m0"],
    ["recibo", "m1"],
    ["supermercado", "m2"],
    ["alquiler", "m3"],
  ])
    expect(
      executeQuery({ op: "search", text }, data).rows.map((r) => r.id),
    ).toEqual([id]);
  expect(
    executeQuery({ op: "search", excludeText: "alquiler" }, data).rows,
  ).toHaveLength(4);
  data.categories = [
    { id: "c", name: "Supermercado", description: "", icon: "", color: "" },
  ];
  data.movements[4].categoryId = "c";
  expect(
    executeQuery({ op: "search", text: "supermercado" }, data).rows,
  ).toHaveLength(2);
  expect(
    executeQuery({ op: "search", text: "Mercadona" }, data).rows.map(
      (r) => r.id,
    ),
  ).toEqual(["m2"]);
});

it("filtra fechas abiertas e importes sin modificar los movimientos", () => {
  const data = fixture([0, 1000, 2000]);
  data.movements[0].date = "2026-08-31";
  const result = executeQuery(
    { op: "search", from: "2026-09-01", minAmount: "1000", maxAmount: "1000" },
    data,
  );
  expect(result.rows.map((r) => r.id)).toEqual(["m1"]);
  expect(result.filters).toContain("2026-09-01");
  expect(
    executeQuery({ op: "search", maxAmount: "0" }, data).rows,
  ).toHaveLength(1);
});
