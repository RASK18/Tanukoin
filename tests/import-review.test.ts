import { expect, it } from "vitest";
import { prepareImport } from "../src/features/import/prepare";
import {
  calculateReviewBalances,
  editReviewedMovement,
  reviewIssues,
  resolveReviewedCandidate,
  refreshReviewNotes,
} from "../src/features/import/review";
import { readPdfPage } from "../src/features/import/pdf-reader";
import { duplicateChecker } from "../src/features/import/parse";
import { reconcileMovementOrder } from "../src/lib/movement-order";
import { validateBackup, exportBackup, restoreBackup } from "../src/lib/backup";
import { db, initialize } from "../src/data/db";
import type { ParsedFile } from "../src/features/import/types";

const account = { id: "a", name: "Ficticia", bank: "", currency: "EUR" };
function prepare(rows: string[][], currency = "EUR") {
  return prepareImport(
    {
      name: "ficticio.csv",
      warnings: [],
      sheets: [
        {
          name: "Hoja",
          rows: [["Fecha", "Concepto", "Importe", "Saldo"], ...rows],
        },
      ],
    },
    { ...account, currency },
    [0],
  );
}
it("calcula en secuencia ascendente global incluyendo filas desmarcadas, cero y negativos", () => {
  const rows = prepare([
    ["22/09/2026", "C", "-4,00", ""],
    ["21/09/2026", "B", "0", ""],
    ["20/09/2026", "A", "2,00", ""],
  ]).candidates;
  rows[1].selected = false;
  const calculated = calculateReviewBalances(rows, "-1,00");
  expect(calculated.map((c) => c.movement.balance)).toEqual([-300, 100, 100]);
  expect(
    calculated.every((c) => c.movement.balanceSource === "calculated"),
  ).toBe(true);
  expect(rows.every((c) => c.movement.balance === undefined)).toBe(true);
  expect(
    calculateReviewBalances(rows, "9,00").map((c) => c.movement.balance),
  ).toEqual([700, 1100, 1100]);
});
it("no rellena huecos si existe algún saldo ni calcula sin un inicio válido", () => {
  const rows = prepare([
    ["20/09/2026", "A", "2,00", ""],
    ["21/09/2026", "B", "-1,00", "10,00"],
  ]).candidates;
  expect(() => calculateReviewBalances(rows, "0")).toThrow("contiene saldos");
  const missing = prepare([["20/09/2026", "A", "2,00", ""]]).candidates;
  for (const value of ["", "texto", "0,001"])
    expect(() => calculateReviewBalances(missing, value)).toThrow();
  expect(() => calculateReviewBalances(missing, "90071992547409,91")).toThrow();
});
it.each([
  ["JPY", "1000", "-250", 750],
  ["KWD", "1,234", "-0,005", 1229],
])(
  "calcula enteros con precisión propia de %s",
  (currency, opening, amount, expected) => {
    const rows = prepare(
      [["20/09/2026", "A", String(amount), ""]],
      String(currency),
    ).candidates;
    expect(
      calculateReviewBalances(rows, String(opening))[0].movement.balance,
    ).toBe(expected);
  },
);
it("detecta saldos en páginas excluidas, incluso cero", () => {
  const file: ParsedFile = {
    name: "ficticio.pdf",
    warnings: [],
    sheets: [
      {
        name: "Primera",
        page: 1,
        rows: [
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["20/09/2026", "A", "1", ""],
        ],
      },
      {
        name: "Segunda",
        page: 2,
        rows: [
          ["Fecha", "Concepto", "Importe", "Saldo"],
          ["21/09/2026", "B", "-1", "0"],
        ],
      },
    ],
  };
  expect(prepareImport(file, account, [0]).hasSourceBalances).toBe(true);
});
it("los totales calculados no sirven para descartar duplicados ni enlazar por saldo", () => {
  const source = prepare([["20/09/2026", "A", "2,00", ""]]).candidates;
  const old = calculateReviewBalances(source, "0")[0].movement;
  const incoming = prepare([
    ["20/09/2026", "A", "2,00", "2,00"],
    ["21/09/2026", "B", "1,00", "3,00"],
  ]).candidates;
  expect(duplicateChecker([old])(incoming[0].movement)).toMatchObject({
    duplicate: "possible",
    selected: true,
    balanceMissing: true,
  });
  expect(
    reconcileMovementOrder(
      [old],
      [incoming[1].movement],
      incoming.map((c) => c.movement),
    ).uncertain,
  ).toBe(true);
});
it("asocia cada aviso PDF a su fila y campos; solo permite corregir esos campos", () => {
  const text = (x: number, y: number, text: string) => ({
    x,
    y,
    text,
    width: 30,
  });
  const sheet = readPdfPage(
    [
      text(400, 800, "Extracto en EUR"),
      text(43, 700, "Fecha"),
      text(125, 700, "Descripción"),
      text(335, 700, "Dinero saliente"),
      text(417, 700, "Dinero entrante"),
      text(535, 700, "Saldo"),
      text(43, 675, "20 sep 2026"),
      text(125, 675, "Compra ficticia"),
      text(335, 675, "10,00€"),
      text(535, 675, "90,00€"),
      text(335, 665, "1.500¥"),
      text(125, 665, "Tipo de cambio de Revolut: 1€ = 150¥"),
      text(43, 630, "21 sep 2026"),
      text(125, 630, "Otra compra"),
      text(335, 630, "5,00€"),
      text(535, 630, "85,00€"),
    ],
    1,
    {},
  );
  const result = prepareImport(
    { name: "ficticio.pdf", warnings: [], sheets: [sheet] },
    account,
    [0],
  );
  const c = result.candidates[0];
  expect(reviewIssues(c).map((i) => i.fields)).toEqual([
    ["originalAmount", "originalCurrency"],
    ["exchangeRate"],
  ]);
  expect(reviewIssues(result.candidates[1])).toEqual([]);
  expect(() => editReviewedMovement(c, { amount: "3" })).toThrow(
    "no tiene incidencias",
  );
  expect(() => editReviewedMovement(c, { originalAmount: "1500" })).toThrow();
  expect(
    editReviewedMovement(c, {
      originalAmount: "1500",
      originalCurrency: "JPY",
      exchangeRate: "1 EUR = 150 JPY",
    }),
  ).toMatchObject({
    originalAmount: 1500,
    originalCurrency: "JPY",
    exchangeRate: "1 EUR = 150 JPY",
    amount: -1000,
    balance: 9000,
  });
  expect(() =>
    editReviewedMovement(c, {
      originalAmount: "1,25",
      originalCurrency: "JPY",
    }),
  ).toThrow();
});
it("conserva saldos calculados en copia y CSV, y rechaza procedencia inválida", async () => {
  await db.delete();
  await db.open();
  await initialize();
  await db.accounts.add(account);
  const rows = calculateReviewBalances(
    prepare([["20/09/2026", "A", "2,00", ""]]).candidates,
    "10",
  );
  await db.movements.add(rows[0].movement);
  const backup = JSON.parse(await exportBackup());
  await db.movements.clear();
  await restoreBackup(backup);
  expect((await db.movements.toArray())[0]).toMatchObject({
    balance: 1200,
    balanceSource: "calculated",
  });
  const invalid = structuredClone(backup);
  invalid.data.movements[0].balanceSource = "banco";
  expect(() => validateBackup(invalid)).toThrow();
  delete invalid.data.movements[0].balance;
  invalid.data.movements[0].balanceSource = "calculated";
  expect(() => validateBackup(invalid)).toThrow();
  const imported = prepareImport(
    {
      name: "exportado.csv",
      warnings: [],
      sheets: [
        {
          name: "Datos",
          rows: [
            ["Fecha", "Concepto", "Importe", "Saldo", "Origen del saldo"],
            ["20/09/2026", "A", "2,00", "12,00", "Calculado"],
          ],
        },
      ],
    },
    account,
    [0],
  );
  expect(imported.errors).toEqual([]);
  expect(imported.candidates[0].movement).toMatchObject({
    balance: 1200,
    balanceSource: "calculated",
  });
});

it("resuelve avisos independientemente y conserva notas ajenas al corregir y reabrir", () => {
  const c = prepare([["20/09/2026", "Compra", "-10", "90"]]).candidates[0];
  c.movement.notes =
    "Nota personal\nInformación original: 1500¥\nComisión: desconocida\nTipo de cambio: 1 EUR = 150¥";
  c.issues = [
    {
      row: 2,
      fields: ["originalAmount", "originalCurrency"],
      message: "Divisa ambigua",
      noteFragments: ["Información original: 1500¥"],
    },
    {
      row: 2,
      fields: ["fee"],
      message: "Comisión ambigua",
      noteFragments: ["Comisión: desconocida"],
    },
    {
      row: 2,
      fields: ["exchangeRate"],
      message: "Cambio ambiguo",
      noteFragments: ["Tipo de cambio: 1 EUR = 150¥"],
    },
  ];
  const edits = { originalAmount: "1500", originalCurrency: "JPY" };
  const partial = resolveReviewedCandidate(c, edits);
  expect(reviewIssues(partial)).toHaveLength(2);
  expect(partial.movement.notes).toBe(
    "Nota personal\nComisión: desconocida\nTipo de cambio: 1 EUR = 150¥",
  );
  const done = resolveReviewedCandidate(partial, {
    ...edits,
    fee: "0",
    exchangeRate: "1 EUR = 150 JPY",
  });
  expect(reviewIssues(done)).toHaveLength(0);
  expect(done.movement.notes).toBe("Nota personal");
  expect(done.movement.fee).toBe(0);
  const reopened = refreshReviewNotes({
    ...done,
    issues: done.issues?.map((issue, index) =>
      index === 0 ? { ...issue, resolved: false } : issue,
    ),
  });
  expect(reopened.movement.notes).toBe(
    "Nota personal\nInformación original: 1500¥",
  );
  expect(reviewIssues(reopened)).toHaveLength(1);
  const blank = resolveReviewedCandidate(done, {
    ...done.edits,
    originalAmount: "",
    originalCurrency: "",
  });
  expect(reviewIssues(blank)).toHaveLength(1);
  expect(blank.movement.notes).toContain("Información original");
});
