import { beforeEach, expect, it } from "vitest";
import { db, initialize, removeMovements } from "../src/data/db";
import { saveEditedMovement } from "../src/data/classification";
import { exportBackup, restoreBackup, validateBackup } from "../src/lib/backup";
import { prepareImport } from "../src/features/import/prepare";
import {
  orderMovements,
  validateMovementOrder,
  uncertainOrderGroups,
} from "../src/lib/movement-order";

const account = { id: "a", name: "Cuenta ficticia", currency: "EUR", bank: "" };
beforeEach(async () => {
  await db.delete();
  await db.open();
  await initialize();
  await db.accounts.add(account);
  const result = prepareImport(
    {
      name: "ficticio.csv",
      kind: "table",
      warnings: [],
      sheets: [
        {
          name: "Datos",
          rows: [
            ["Fecha", "Concepto", "Importe", "Saldo"],
            ["05/09/2026", "A", "10", "10"],
            ["05/09/2026", "B", "20", "30"],
            ["05/09/2026", "C", "30", "60"],
          ],
        },
      ],
    },
    account,
    [0],
  );
  await db.movements.bulkAdd(
    result.candidates.map((c) => ({ ...c.movement, importId: "batch" })),
  );
});

it("las copias conservan orden, procedencia y relaciones tras restaurar", async () => {
  const original = orderMovements(await db.movements.toArray());
  const backup = JSON.parse(await exportBackup());
  validateBackup(backup);
  await db.movements.clear();
  await restoreBackup(backup);
  expect(orderMovements(await db.movements.toArray())).toEqual(original);
  expect(backup.schemaVersion).toBe(3);
});

it("editar comisión y cambio conserva importe, saldo y orden; los valores inválidos no se guardan", async () => {
  const original = orderMovements(await db.movements.toArray())[0];
  await saveEditedMovement(
    { ...original, fee: 25, exchangeRate: "1 EUR = 0.851234 GBP" },
    false,
    [],
  );
  const saved = (await db.movements.get(original.id))!;
  expect(saved).toMatchObject({
    ...original,
    fee: 25,
    exchangeRate: "1 EUR = 0.851234 GBP",
  });
  await expect(
    saveEditedMovement({ ...saved, fee: -1 }, false, []),
  ).rejects.toThrow("comisión");
  await expect(
    saveEditedMovement({ ...saved, exchangeRate: "0" }, false, []),
  ).rejects.toThrow("cambio");
  expect(await db.movements.get(original.id)).toEqual(saved);
  await saveEditedMovement(
    { ...saved, fee: undefined, exchangeRate: undefined },
    false,
    [],
  );
  expect((await db.movements.get(original.id))?.fee).toBeUndefined();
  expect((await db.movements.get(original.id))?.exchangeRate).toBeUndefined();
});

it("editar datos originales y la fecha secundaria conserva el orden y valida antes de guardar", async () => {
  const original = orderMovements(await db.movements.toArray())[0];
  await saveEditedMovement(
    {
      ...original,
      secondaryDate: "2026-09-06",
      originalAmount: 0,
      originalCurrency: "JPY",
    },
    false,
    [],
  );
  const saved = (await db.movements.get(original.id))!;
  expect(saved.order).toEqual(original.order);
  expect(saved).toMatchObject({
    secondaryDate: "2026-09-06",
    originalAmount: 0,
    originalCurrency: "JPY",
  });
  await expect(
    saveEditedMovement({ ...saved, secondaryDate: "2026-09-04" }, false, []),
  ).rejects.toThrow("anterior");
  await expect(
    saveEditedMovement({ ...saved, originalCurrency: undefined }, false, []),
  ).rejects.toThrow("juntos");
  expect(await db.movements.get(original.id)).toEqual(saved);
});

it("editar hora principal invalida orden; la secundaria lo conserva y requiere su fecha", async () => {
  const m = orderMovements(await db.movements.toArray())[1];
  await saveEditedMovement(
    { ...m, secondaryDate: "2026-09-06", secondaryTime: "10:11:12" },
    false,
    [],
  );
  const secondary = (await db.movements.get(m.id))!;
  expect(secondary.order).toEqual(m.order);
  await expect(
    saveEditedMovement({ ...secondary, secondaryDate: undefined }, false, []),
  ).rejects.toThrow("fecha secundaria");
  await saveEditedMovement({ ...secondary, time: "08:00:00" }, false, []);
  const saved = (await db.movements.get(m.id))!;
  expect(saved.time).toBe("08:00:00");
  expect(saved.order?.uncertain).toBe(true);
  expect(saved.order?.after).toEqual([]);
});

it.each([
  "dangling",
  "cycle",
  "otherDate",
  "otherAccount",
  "rank",
  "provenance",
])("rechaza copia de orden inválido %s sin alterar datos", async (kind) => {
  const backup = JSON.parse(await exportBackup());
  const rows = orderMovements(backup.data.movements);
  if (kind === "dangling") rows[1].order!.after = ["not-present"];
  if (kind === "cycle") rows[0].order!.after = [rows[2].id];
  if (kind === "otherDate") rows[1].date = "2026-09-06";
  if (kind === "otherAccount") {
    backup.data.accounts.push({ ...account, id: "b" });
    rows[1].accountId = "b";
  }
  if (kind === "rank") rows[1].order!.rank = 1.5;
  if (kind === "provenance") rows[1].sourcePosition!.position = -1;
  await expect(restoreBackup(backup)).rejects.toThrow();
  expect(await db.movements.count()).toBe(3);
  validateMovementOrder(await db.movements.toArray());
});

it("editar notas o categorías conserva el orden; cambiar fecha invalida referencias", async () => {
  const original = orderMovements(await db.movements.toArray());
  await saveEditedMovement(
    { ...original[1], notes: "Nota ficticia" },
    true,
    [],
  );
  expect((await db.movements.get(original[1].id))!.order).toEqual(
    original[1].order,
  );
  await saveEditedMovement({ ...original[1], date: "2026-09-06" }, false, []);
  const rows = await db.movements.toArray();
  validateMovementOrder(rows);
  expect(rows.every((m) => !m.order?.after.includes(original[1].id))).toBe(
    true,
  );
  expect(orderMovements(rows).map((m) => m.description)).toEqual([
    "A",
    "C",
    "B",
  ]);
  expect(uncertainOrderGroups(rows).size).toBe(1);
});

it("cambiar importe invalida evidencia y eliminar contrae las relaciones válidas", async () => {
  const original = orderMovements(await db.movements.toArray());
  await saveEditedMovement({ ...original[1], amount: 999 }, false, []);
  const changed = await db.movements.toArray();
  expect(uncertainOrderGroups(changed).size).toBe(1);
  validateMovementOrder(changed);
  await db.movements.bulkPut(original);
  await removeMovements([original[1].id]);
  const remaining = orderMovements(await db.movements.toArray());
  expect(remaining.map((m) => m.description)).toEqual(["A", "C"]);
  expect(remaining[1].order!.after).toEqual([remaining[0].id]);
  validateMovementOrder(remaining);
});

it("un fallo de escritura revierte también la invalidación del orden", async () => {
  const original = orderMovements(await db.movements.toArray());
  const put = db.movements.bulkPut.bind(db.movements);
  db.movements.bulkPut = (async (...args: Parameters<typeof put>) => {
    await put(...args);
    throw new Error("Fallo ficticio");
  }) as unknown as typeof db.movements.bulkPut;
  try {
    await expect(
      saveEditedMovement({ ...original[1], date: "2026-09-06" }, false, []),
    ).rejects.toThrow("Fallo ficticio");
  } finally {
    db.movements.bulkPut = put;
  }
  expect(orderMovements(await db.movements.toArray())).toEqual(original);
});
