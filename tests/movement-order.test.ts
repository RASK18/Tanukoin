import { expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { Movement } from "../src/data/types";
import { readTabular } from "../src/features/import/tabular";
import { prepareImport } from "../src/features/import/prepare";
import {
  inferSourceOrder,
  reconcileMovementOrder,
  orderMovements,
  detachMovementOrder,
  validateMovementOrder,
  uncertainOrderGroups,
} from "../src/lib/movement-order";

const account = { id: "a", name: "Ficticia", bank: "", currency: "EUR" };
const header = ["Fecha", "Concepto", "Importe", "Saldo"];
const sample = [
  ["01/09/2026", "Entrada cultural", "-12,00", "30,00"],
  ["05/09/2026", "Ingreso de prueba", "100,00", "130,00"],
  ["05/09/2026", "Transferencia de prueba", "-80,00", "50,00"],
  ["09/09/2026", "Cambio de prueba", "300,00", "350,00"],
  ["09/09/2026", "Compra de prueba", "-300,00", "50,00"],
];
const names = sample.map((r) => r[1]);
function table(rows: string[][], saved: Movement[] = []) {
  return prepareImport(
    readTabular(
      new TextEncoder().encode(
        [header, ...rows].map((r) => r.join(";")).join("\n"),
      ).buffer,
      "ficticio.csv",
    ),
    account,
    [0],
    {},
    saved,
  ).candidates;
}
function commit(rows: ReturnType<typeof table>, saved: Movement[] = []) {
  return reconcileMovementOrder(
    saved,
    rows.filter((c) => c.selected).map((c) => c.movement),
    rows.map((c) => c.movement),
  );
}
const descriptions = (rows: Movement[], desc = false) =>
  orderMovements(rows, desc).map((m) => m.description);

it("las columnas originales determinan el sentido aunque ambas fechas normalizadas salten", () => {
  const parsed = readTabular(
    new TextEncoder().encode(
      "Fecha de operación;Fecha de valor;Concepto;Importe\n10/09/2026;04/09/2026;A;-1\n09/09/2026;11/09/2026;B;-2\n08/09/2026;08/09/2026;C;-3",
    ).buffer,
    "ficticio.csv",
  );
  const candidates = prepareImport(parsed, account, [0]).candidates;
  const result = commit(candidates);
  expect(descriptions(result.pending)).toEqual(["C", "B", "A"]);
  expect(orderMovements(result.pending).map((m) => m.date)).toEqual([
    "2026-09-08",
    "2026-09-09",
    "2026-09-04",
  ]);
  expect(result.uncertain).toBe(false);
  expect(descriptions(inferSourceOrder(result.pending))).toEqual([
    "C",
    "B",
    "A",
  ]);
  validateMovementOrder(result.pending);
});

it("Revolut respeta finalización y saldos aunque inicio retroceda", () => {
  const parsed = readTabular(
    new TextEncoder().encode(
      "Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Divisa,State,Saldo\nRecargas,Actual,2026-09-10 12:30:00,2026-09-10 12:30:01,Ingreso,20,0,EUR,COMPLETADO,50\nPago con tarjeta,Actual,2026-09-10 11:30:00,2026-09-11 09:00:00,Compra,-10,0,EUR,COMPLETADO,40",
    ).buffer,
    "ficticio.csv",
  );
  const result = commit(prepareImport(parsed, account, [0]).candidates);
  expect(descriptions(result.pending)).toEqual(["Ingreso", "Compra"]);
  expect(result.uncertain).toBe(false);
});

it("N26 conserva el salto entre días y no avisa por carecer de saldo", () => {
  const parsed = readTabular(
    new TextEncoder().encode(
      "Booking Date,Value Date,Partner Name,Payment Reference,Amount (EUR)\n2026-09-05,2026-09-05,A,,-1\n2026-09-06,2026-09-04,B,,-2\n2026-09-06,2026-09-06,C,,-3",
    ).buffer,
    "ficticio.csv",
  );
  const result = commit(prepareImport(parsed, account, [0]).candidates);
  expect(descriptions(result.pending)).toEqual(["A", "B", "C"]);
  expect(descriptions(result.pending, true)).toEqual(["C", "B", "A"]);
  expect(result.uncertain).toBe(false);
});

it("un enlace exacto une cadenas entre días distintos sin forzar la fecha principal", () => {
  const initial = commit(
    table([
      ["06/09/2026", "A", "10", "10"],
      ["05/09/2026", "B", "20", "30"],
    ]),
  ).pending;
  // Explicit physical chain: the inconsistent dates are a source issue, not a reason to sort the rows.
  const result = commit(
    table(
      [
        ["05/09/2026", "B", "20", "30"],
        ["07/09/2026", "C", "30", "60"],
      ],
      initial,
    ),
    initial,
  );
  const all = [
    ...initial.filter((m) => !result.updates.some((u) => u.id === m.id)),
    ...result.updates,
    ...result.pending,
  ];
  expect(descriptions(all)).toEqual(["A", "B", "C"]);
  expect(result.pending).toHaveLength(1);
  validateMovementOrder(all);
});

it("no une periodos sin solapamiento fiable ni cambia la secuencia de cada archivo", () => {
  const initial = commit(table([["05/09/2026", "A", "10", "10"]])).pending;
  const result = commit(
    table(
      [
        ["01/09/2026", "B", "20", "20"],
        ["02/09/2026", "C", "30", "50"],
      ],
      initial,
    ),
    initial,
  );
  expect(descriptions([...result.updates, ...result.pending])).toEqual([
    "A",
    "B",
    "C",
  ]);
  expect(result.uncertain).toBe(true);
});

it.each([false, true])(
  "conserva la secuencia completa y su inversa con CSV invertido=%s",
  (reverse) => {
    const result = commit(table(reverse ? [...sample].reverse() : sample));
    expect(descriptions(result.pending)).toEqual(names);
    expect(descriptions(result.pending, true)).toEqual([...names].reverse());
    expect(result.uncertain).toBe(false);
    expect(
      result.pending.every((m) => !m.time && !Object.hasOwn(m, "timestamp")),
    ).toBe(true);
    validateMovementOrder(result.pending);
  },
);

it("avisa ante un extracto de sentidos incompatibles sin reconstruir sus días", () => {
  const result = commit(
    table([...sample.slice(3), ...sample.slice(1, 3), sample[0]]),
  );
  expect(descriptions(result.pending)).toEqual([
    names[0],
    names[2],
    names[1],
    names[4],
    names[3],
  ]);
  expect(result.uncertain).toBe(true);
});

it("invierte toda la secuencia descendente, incluidos empates sin saldo, sin avisar", () => {
  const result = commit(
    table([
      ["06/09/2026", "Otro día", "1", ""],
      ["05/09/2026", "Primero en origen", "1", ""],
      ["05/09/2026", "Segundo en origen", "1", ""],
    ]),
  );
  expect(descriptions(result.pending)).toEqual([
    "Segundo en origen",
    "Primero en origen",
    "Otro día",
  ]);
  expect(result.uncertain).toBe(false);
  expect(result.pending.filter((m) => m.order?.after.length)).toHaveLength(2);
});

it.each(["xlsx", "xls"] as const)("conserva orden en %s", (bookType) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([header, ...sample]),
    "Operaciones",
  );
  const parsed = readTabular(
    XLSX.write(book, { type: "array", bookType }),
    `ficticio.${bookType}`,
  );
  const rows = prepareImport(parsed, account, [0]).candidates;
  expect(descriptions(commit(rows).pending)).toEqual(names);
});

it("mantiene posición global en páginas PDF y comprueba saldos al cruzar página", () => {
  const parsed = {
    name: "ficticio.pdf",
    kind: "pdf" as const,
    warnings: [],
    sheets: [
      { name: "Página 1", page: 1, rows: [header, sample[1]] },
      { name: "Página 2", page: 2, rows: [header, sample[2]] },
    ],
  };
  const rows = prepareImport(parsed, account, [1, 0]).candidates;
  expect(rows.map((c) => c.movement.sourcePosition?.position)).toEqual([2, 4]);
  expect(rows[1].movement.sourcePosition?.previousPosition).toBe(2);
  expect(commit(rows).uncertain).toBe(false);
  expect(descriptions(commit(rows).pending)).toEqual(names.slice(1, 3));
});

it("no exige continuidad de saldo entre páginas excluidas", () => {
  const parsed = {
    name: "ficticio.pdf",
    kind: "pdf" as const,
    warnings: [],
    sheets: [
      {
        name: "Página 1",
        page: 1,
        rows: [header, ["05/09/2026", "Uno", "10", "10"]],
      },
      {
        name: "Página 2",
        page: 2,
        rows: [header, ["05/09/2026", "Dos", "20", "30"]],
      },
      {
        name: "Página 3",
        page: 3,
        rows: [header, ["05/09/2026", "Tres", "30", "60"]],
      },
    ],
  };
  const rows = prepareImport(parsed, account, [0, 2]).candidates;
  expect(rows[1].movement.sourcePosition?.previousPosition).toBeUndefined();
  expect(commit(rows).uncertain).toBe(false);
  expect(descriptions(commit(rows).pending)).toEqual(["Uno", "Tres"]);
});

it("descartar una fila conserva precedencia, pero nunca inventa saldo", () => {
  const rows = table([
    ["05/09/2026", "Uno", "10", "10"],
    ["05/09/2026", "Dos", "20", "30"],
    ["05/09/2026", "Tres", "30", "60"],
  ]);
  rows[1].selected = false;
  const result = commit(rows);
  expect(descriptions(result.pending)).toEqual(["Uno", "Tres"]);
  expect(result.pending.map((m) => m.balance)).toEqual([1000, 6000]);
  expect(result.uncertain).toBe(false);
  validateMovementOrder(result.pending);
});

it("fechas intercaladas no prueban continuidad entre bloques completos", () => {
  const result = commit(
    table([
      ["05/09/2026", "A", "10", "10"],
      ["06/09/2026", "B", "20", "30"],
      ["05/09/2026", "C", "5", "15"],
    ]),
  );
  expect(descriptions(result.pending)).toEqual(["A", "B", "C"]);
  expect(result.uncertain).toBe(true);
});

it.each(["", "50"])(
  "un día sin horas (saldo=%s) acepta la secuencia del documento",
  (balance) => {
    const result = commit(
      table([
        ["05/09/2026", "Primero", "0", balance],
        ["05/09/2026", "Segundo", "0", balance],
      ]),
    );
    expect(descriptions(result.pending)).toEqual(["Primero", "Segundo"]);
    expect(result.uncertain).toBe(false);
    expect(result.pending[1].order?.after).toEqual([result.pending[0].id]);
  },
);

it("utiliza las horas escritas del mismo origen sin convertir zonas", () => {
  const rows = table([
    ["2026-09-05T11:00:00+02:00", "Posterior", "0", ""],
    ["2026-09-05T08:00:00Z", "Anterior", "0", ""],
  ]);
  const result = commit(rows);
  expect(descriptions(result.pending)).toEqual(["Anterior", "Posterior"]);
  expect(result.uncertain).toBe(false);
  const noZone = commit(
    table([
      ["2026-09-05 11:00:00", "Primero", "0", ""],
      ["2026-09-05 08:00:00", "Segundo", "0", ""],
    ]),
  );
  expect(noZone.uncertain).toBe(false);
  expect(descriptions(noZone.pending)).toEqual(["Segundo", "Primero"]);
  expect(noZone.pending.every((m) => !Object.hasOwn(m, "timestamp"))).toBe(
    true,
  );
});

it("avisa cuando la hora principal contradice la secuencia de saldos sin alterarlos", () => {
  const result = commit(
    table([
      ["2026-09-05 18:00:00", "Contabilizado primero", "10", "110"],
      ["2026-09-05 08:00:00", "Iniciado antes", "20", "130"],
    ]),
  );
  expect(descriptions(result.pending)).toEqual([
    "Contabilizado primero",
    "Iniciado antes",
  ]);
  expect(result.uncertain).toBe(true);
  expect(
    result.pending.find((m) => m.description === "Contabilizado primero")
      ?.balance,
  ).toBe(11000);
  expect(
    result.pending.find((m) => m.description === "Iniciado antes")?.balance,
  ).toBe(13000);
});

it("enlaza dos importaciones por un solapamiento exacto sin guardar otra copia", () => {
  const initial = commit(
    table([
      ["05/09/2026", "Uno", "10", "10"],
      ["05/09/2026", "Dos", "20", "30"],
    ]),
  ).pending;
  const rows = table(
    [
      ["05/09/2026", "Dos", "20", "30"],
      ["05/09/2026", "Tres", "30", "60"],
    ],
    initial,
  );
  expect(rows[0].selected).toBe(false);
  const result = commit(rows, initial);
  const all = [
    ...initial.filter((m) => !result.updates.some((u) => u.id === m.id)),
    ...result.updates,
    ...result.pending,
  ];
  expect(all).toHaveLength(3);
  expect(descriptions(all)).toEqual(["Uno", "Dos", "Tres"]);
  expect(result.uncertain).toBe(false);
  validateMovementOrder(all);
});

it("dos predecesores de un enlace conservan la ambigüedad y sus relaciones fiables", () => {
  const initial = commit(
    table([
      ["2026-09-05T08:00:00Z", "A", "10", "10"],
      ["2026-09-05T10:00:00Z", "C", "30", "40"],
    ]),
  ).pending;
  const rows = table(
    [
      ["2026-09-05T09:00:00Z", "B", "10", "10"],
      ["2026-09-05T10:00:00Z", "C", "30", "40"],
    ],
    initial,
  );
  const result = commit(rows, initial);
  const all = [
    ...initial.filter((m) => !result.updates.some((u) => u.id === m.id)),
    ...result.updates,
    ...result.pending,
  ];
  expect(result.uncertain).toBe(true);
  expect(descriptions(all)).toEqual(["A", "B", "C"]);
  const c = all.find((m) => m.description === "C")!;
  expect(c.order?.after).toHaveLength(2);
  expect(all.find((m) => m.description === "B")!.order?.after).toEqual([]);
});

it("no enlaza por saldos ausentes ni por coincidencias repetidas", () => {
  const old = commit(table([["05/09/2026", "A", "10", "10"]])).pending;
  const rows = table(
    [
      ["05/09/2026", "A", "10", "10"],
      ["05/09/2026", "A", "10", "10"],
      ["05/09/2026", "B", "10", "20"],
    ],
    old,
  );
  const result = commit(rows, old);
  expect(result.pending).toHaveLength(1);
  expect(result.uncertain).toBe(true);
  const missing = commit(table([["05/09/2026", "A", "10", ""]], old), old);
  expect(missing.pending).toHaveLength(1);
  expect(missing.uncertain).toBe(true);
});

it.each([false, true])(
  "una fila descartada sin saldo no enlaza aunque tenga hora real: importe distinto=%s",
  (contradiction) => {
    const initial = commit(
      table([["2026-09-05T08:00:00Z", "A", "10", ""]]),
    ).pending;
    const rows = table([
      ["2026-09-05T08:00:00Z", "A", contradiction ? "15" : "10", ""],
      ["2026-09-05T09:00:00Z", "B", "20", ""],
    ]);
    rows[0].selected = false;
    rows[0].duplicate = "possible";
    const result = commit(rows, initial);
    expect(result.pending).toHaveLength(1);
    expect(result.uncertain).toBe(true);
    expect(result.pending[0].order?.after).toEqual([]);
  },
);

it("la corrección de una fila en revisión no reutiliza su evidencia original", () => {
  const rows = table(sample).map((c) => c.movement);
  rows[1].amount = 500;
  const source = inferSourceOrder(rows, new Set([rows[1].id]));
  expect(source[1].order?.sourceIssue).toBe(true);
  expect(descriptions(source)).toEqual(names);
  const result = reconcileMovementOrder([], source, source);
  expect(result.pending[1].order?.uncertain).toBe(true);
});

it("rechaza relaciones contradictorias conservando la cadena previa y los nuevos movimientos", () => {
  const saved = commit(
    table([
      ["05/09/2026", "A", "10", "10"],
      ["05/09/2026", "B", "20", "30"],
    ]),
  ).pending;
  const source = table(
    [
      ["2026-09-05T08:00:00Z", "B", "20", "30"],
      ["2026-09-05T09:00:00Z", "N", "5", ""],
      ["2026-09-05T10:00:00Z", "A", "10", "10"],
    ],
    saved,
  );
  const result = commit(source, saved);
  expect(result.conflict).toBe(true);
  expect(result.uncertain).toBe(true);
  expect(descriptions([...result.updates, ...result.pending])).toEqual([
    "A",
    "B",
    "N",
  ]);
  validateMovementOrder([...result.updates, ...result.pending]);
});

it("no modifica otras cuentas y los filtros conservan la secuencia", () => {
  const rows = commit(table(sample)).pending;
  const other = rows.map((m) => ({
    ...m,
    id: `other-${m.id}`,
    accountId: "z",
    order: undefined,
  }));
  const merged = orderMovements([...rows, ...other]);
  expect(
    merged.filter((m) => m.accountId === "a").map((m) => m.description),
  ).toEqual(names);
  expect(descriptions(rows.filter((m) => m.description !== names[1]))).toEqual(
    names.filter((n) => n !== names[1]),
  );
  expect(uncertainOrderGroups(other).size).toBe(1);
});

it("eliminar un eslabón conserva precedencia sin referencias huérfanas; editar la invalida", () => {
  const rows = commit(
    table([
      ["05/09/2026", "A", "10", "10"],
      ["05/09/2026", "B", "20", "30"],
      ["05/09/2026", "C", "30", "60"],
    ]),
  ).pending;
  const ids = new Set([rows[1].id]);
  const remaining = detachMovementOrder(rows, ids, true);
  expect(descriptions(remaining)).toEqual(["A", "C"]);
  expect(remaining[1].order?.after).toEqual([rows[0].id]);
  validateMovementOrder(remaining);
  const edited = detachMovementOrder(rows, ids);
  expect(uncertainOrderGroups(edited).size).toBe(1);
  expect(edited.every((m) => !m.order?.after.includes(rows[1].id))).toBe(true);
});

it("valida relaciones, posiciones, ciclos y procedencia", () => {
  const rows = commit(table(sample)).pending;
  validateMovementOrder(rows);
  for (const mutate of [
    (r: Movement[]) => {
      r[1].order!.rank = -1;
    },
    (r: Movement[]) => {
      r[1].order!.after = ["missing"];
    },
    (r: Movement[]) => {
      r[1].accountId = "otra-cuenta";
    },
    (r: Movement[]) => {
      r[1].order!.after = [r[2].id];
    },
    (r: Movement[]) => {
      r[1].sourcePosition!.row = 0;
    },
    (r: Movement[]) => {
      r[1].sourcePosition!.direction = 0 as 1;
    },
    (r: Movement[]) => {
      r[1].order!.sourceIssue = true;
      r[1].order!.uncertain = false;
    },
    (r: Movement[]) => {
      r[1].sourcePosition!.previousPosition = r[1].sourcePosition!.position;
    },
    (r: Movement[]) => {
      r[1].order!.uncertain = "yes" as unknown as boolean;
    },
  ]) {
    const copy = structuredClone(rows);
    mutate(copy);
    expect(() => validateMovementOrder(copy)).toThrow();
  }
});
