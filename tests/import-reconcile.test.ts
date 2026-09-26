import { beforeEach, expect, it, vi } from "vitest";
import type { Movement } from "../src/data/types";
import type { Candidate } from "../src/features/import/types";
import {
  enrichMovement,
  matchImport,
  reconcileImport,
  recordOccurrence,
  validateImportMetadata,
} from "../src/features/import/reconcile";
import { commitImport } from "../src/features/import/commit";
import { db, initialize } from "../src/data/db";
import { exportBackup, restoreBackup } from "../src/lib/backup";
import {
  normalizeImportedText,
  movementDescription,
} from "../src/lib/movement-text";
import { applyRules, fingerprint } from "../src/lib/finance";

const account = { id: "account", name: "Ficticia", bank: "", currency: "EUR" };
function sequence(
  amounts: number[],
  prefix: string,
  extra: Partial<Movement> = {},
): Movement[] {
  return amounts.map((amount, i) => {
    const m: Movement = {
      id: `${prefix}${i}`,
      accountId: account.id,
      currency: "EUR",
      amount,
      date: "2026-09-20",
      description: `Operación ${amount}`,
      merchant: "",
      notes: "",
      categorySource: "none",
      tagIds: [],
      source: "ficticio.csv",
      createdAt: "2026-09-20T00:00:00Z",
      fingerprint: "",
      importId: prefix,
      sourcePosition: {
        sheet: "Datos",
        row: i + 2,
        position: i + 2,
        previousPosition: i ? i + 1 : undefined,
        direction: 1,
      },
      order: {
        rank: i,
        after: i ? [`${prefix}${i - 1}`] : [],
        uncertain: false,
      },
      ...extra,
    };
    m.fingerprint = fingerprint(m);
    return m;
  });
}
const candidates = (rows: Movement[]): Candidate[] =>
  rows.map((movement, i) => ({
    movement,
    row: i + 2,
    selected: true,
    duplicate: "none",
  }));
beforeEach(async () => {
  await db.delete();
  await db.open();
  await initialize();
  await db.accounts.add(account);
});

it("separa referencia, sanitiza IBAN y mantiene presentación y reglas", () => {
  const text = normalizeImportedText({
    description: "Pago de Ana Prueba",
    reference: "Factura 02 ES0000000000000000000000",
  });
  expect(text.description).toBe("Pago de Ana Prueba");
  expect(text.reference).toBe("Factura 02");
  expect(movementDescription(text)).toBe("Pago de Ana Prueba. Factura 02");
  const m = { ...sequence([100], "a")[0], ...text };
  expect(
    applyRules(m, [
      {
        id: "r",
        name: "Factura",
        priority: 1,
        enabled: true,
        descriptionContains: "Factura 02",
        merchantContains: "",
        categoryId: "c",
        note: "",
      },
    ]).categoryId,
  ).toBe("c");
});
it("reconoce 2–5 en 1–5 / 2–8 sin saldos ni conceptos iguales", () => {
  const old = sequence([100, 200, 300, 400, 500], "old");
  const fresh = sequence([200, 300, 400, 500, 600, 700, 800], "new", {
    description: "Otro formato",
  });
  const matches = [...matchImport(fresh, old).values()];
  expect(matches.map((m) => m.targetId)).toEqual([
    "old1",
    "old2",
    "old3",
    "old4",
    undefined,
    undefined,
    undefined,
  ]);
  expect(matches.slice(0, 4).every((m) => m.reason === "sequence")).toBe(true);
});
it("exige tres, diversidad y un encaje único; conserva repeticiones", () => {
  for (const values of [[100], [100, 200], [100, 100, 100]]) {
    expect(
      [
        ...matchImport(sequence(values, "n"), sequence(values, "s")).values(),
      ].every((m) => !m.targetId),
    ).toBe(true);
  }
  expect(
    [
      ...matchImport(
        sequence([1, 2, 3], "n"),
        sequence([1, 2, 3, 1, 2, 3], "s"),
      ).values(),
    ].every((m) => !m.targetId),
  ).toBe(true);
  const saved = sequence([100], "s", { balance: 900 });
  expect(
    [
      ...matchImport(
        sequence([100, 100], "n", { balance: 900 }),
        saved,
      ).values(),
    ].every((m) => !m.targetId),
  ).toBe(true);
});
it("usa saldo bancario único, ambas fechas y cuenta/moneda; ignora saldos calculados", () => {
  const old = sequence([100], "s", { balance: 900 });
  const fresh = sequence([100], "n", {
    date: "2026-09-19",
    secondaryDate: "2026-09-20",
    balance: 900,
    description: "Distinto",
  });
  expect(matchImport(fresh, old).get("n0")?.targetId).toBe("s0");
  for (const extra of [
    { balance: 800 },
    { balanceSource: "calculated" as const },
    { accountId: "other" },
    { currency: "USD" },
  ]) {
    expect(
      matchImport([{ ...fresh[0], ...extra }], old).get("n0")?.targetId,
    ).toBeUndefined();
  }
});
it("no cruza huecos ni contradicciones; sí usa filas desmarcadas y sentido descendente", () => {
  const old = sequence([1, 2, 3], "s"),
    fresh = sequence([1, 2, 3], "n");
  fresh[1].sourcePosition!.previousPosition = undefined;
  expect([...matchImport(fresh, old).values()].every((m) => !m.targetId)).toBe(
    true,
  );
  fresh[1].sourcePosition!.previousPosition = 2;
  const rows = candidates(fresh);
  rows[1].selected = false;
  expect(reconcileImport(rows, old).map((r) => r.status)).toEqual([
    "known",
    "omit",
    "known",
  ]);
  const descending = sequence([3, 2, 1], "d");
  descending.forEach((m) => (m.sourcePosition!.direction = -1));
  expect(
    [...matchImport(descending, old).values()].map((m) => m.targetId),
  ).toEqual(["s2", "s1", "s0"]);
});
it("amplía PDF/CSV/PDF sin perder fechas, horas, categorías o notas", () => {
  const old = sequence([-171], "s", {
    date: "2026-07-19",
    balance: 989,
    notes: "Nota personal",
    categorySource: "manual",
    tagIds: ["t"],
  })[0];
  const fresh = {
    ...old,
    id: "n",
    date: "2026-07-18",
    secondaryDate: "2026-07-19",
    time: "19:09:10",
    secondaryTime: "17:39:27",
    reference: "Factura",
    fee: 0,
    notes: "Detalle del banco",
  };
  const result = enrichMovement(old, fresh);
  expect(result.changes.every((c) => !c.conflict)).toBe(true);
  expect(result.proposed).toMatchObject({
    id: old.id,
    date: fresh.date,
    secondaryDate: fresh.secondaryDate,
    time: fresh.time,
    secondaryTime: fresh.secondaryTime,
    reference: "Factura",
    fee: 0,
    notes: "Nota personal\nDetalle del banco",
    categorySource: "manual",
    tagIds: ["t"],
  });
  expect(enrichMovement(result.proposed, old).proposed).toEqual(
    result.proposed,
  );
  expect(matchImport([old], [result.proposed]).get(old.id)?.targetId).toBe(
    old.id,
  );
});
it("resuelve grupos conflictivos y protege ceros y modificaciones manuales", () => {
  const old = sequence([1], "s", {
    fee: 0,
    notes: "Personal",
    manualFields: ["notes"],
    originalAmount: 0,
    originalCurrency: "JPY",
    date: "2026-09-19",
    secondaryDate: "2026-09-20",
  })[0];
  const fresh = {
    ...old,
    id: "n",
    notes: "Importada",
    fee: 20,
    originalAmount: 10,
    originalCurrency: "USD",
    date: "2026-09-20",
    secondaryDate: "2026-09-21",
  };
  const proposal = enrichMovement(old, fresh);
  expect(
    proposal.changes
      .filter((c) => c.conflict)
      .map((c) => c.key)
      .sort(),
  ).toEqual(["dates", "fee", "notes", "original"]);
  expect(proposal.proposed.notes).toBe("Personal");
  const resolved = enrichMovement(old, fresh, {
    dates: "incoming",
    fee: "saved",
    notes: "incoming",
    original: "incoming",
  }).proposed;
  expect(resolved).toMatchObject({
    fee: 0,
    originalAmount: 10,
    originalCurrency: "USD",
    date: fresh.date,
    notes: "Personal\nImportada",
  });
});
it("reemplaza calculados por bancarios, nunca al revés, y bloquea dudas", () => {
  const old = sequence([1], "s", {
    balance: 100,
    balanceSource: "calculated",
  })[0];
  const fresh = { ...old, id: "n", balance: 900, balanceSource: undefined };
  expect(enrichMovement(old, fresh).proposed).toMatchObject({
    balance: 900,
    balanceSource: undefined,
  });
  expect(enrichMovement(fresh, old).proposed.balance).toBe(900);
  const rows = reconcileImport(candidates([fresh]), [old]);
  expect(rows[0].blocking).toBe(true);
  expect(
    reconcileImport(
      [{ ...candidates([fresh])[0], decision: { targetId: old.id } }],
      [old],
    )[0].status,
  ).toBe("update");
});
it("guarda ampliaciones solas, procedencia, copias y enlaces sin recrear IDs", async () => {
  const old = sequence([1, 2, 3], "s");
  await db.movements.bulkAdd(old);
  const fresh = sequence([1, 2, 3], "n", { reference: "Referencia nueva" });
  const rows = reconcileImport(candidates(fresh), old);
  await commitImport(rows, old, [], fresh, "doc");
  const saved = await db.movements.toArray();
  expect(saved).toHaveLength(3);
  expect(saved.every((m) => m.reference === "Referencia nueva")).toBe(true);
  expect(saved[0].occurrences).toHaveLength(1);
  const again = reconcileImport(candidates(fresh), saved);
  await commitImport(again, saved, [], fresh, "doc");
  expect(await db.movements.toArray()).toEqual(saved);
  const backup = JSON.parse(await exportBackup());
  await restoreBackup(backup);
  expect(await db.movements.toArray()).toEqual(saved);
  const invalid = {
    ...saved[0],
    occurrences: [...saved[0].occurrences!, ...saved[0].occurrences!],
  };
  expect(() => validateImportMetadata(invalid)).toThrow();
});
it("revierte ampliaciones y altas juntas, permite reintentar y detecta concurrencia", async () => {
  const old = sequence([1, 2, 3], "s");
  await db.movements.bulkAdd(old);
  const fresh = sequence([1, 2, 3, 4], "n", { reference: "Nueva" });
  const rows = reconcileImport(candidates(fresh), old);
  const spy = vi
    .spyOn(db.movements, "bulkAdd")
    .mockRejectedValueOnce(new Error("Fallo simulado"));
  await expect(
    commitImport(rows, old, [fresh[3]], fresh, "doc"),
  ).rejects.toThrow("Fallo simulado");
  expect(await db.movements.toArray()).toEqual(old);
  spy.mockRestore();
  await commitImport(rows, old, [fresh[3]], fresh, "doc");
  expect(await db.movements.count()).toBe(4);
  await expect(
    commitImport(rows, old, [fresh[3]], fresh, "doc"),
  ).rejects.toThrow("han cambiado");
});
it("la procedencia repetida es idempotente", () => {
  const m = sequence([0], "s")[0];
  const recorded = recordOccurrence(m, m, "doc");
  expect(recordOccurrence(recorded, m, "doc")).toEqual(recorded);
});

it("los conceptos desambigüan bloques y una contradicción de origen no confirma secuencia", () => {
  const saved = sequence([1, 2, 3, 1, 2, 3], "s"),
    fresh = sequence([1, 2, 3], "n");
  saved.slice(3).forEach((m) => (m.description = "Otro concepto"));
  expect(
    [...matchImport(fresh, saved).values()].map((m) => m.targetId),
  ).toEqual(["s0", "s1", "s2"]);
  fresh[1].order!.sourceIssue = true;
  expect(
    [...matchImport(fresh, saved).values()].every((m) => !m.targetId),
  ).toBe(true);
});
it("omitir libera una correspondencia manual, pero nunca permite consumirla dos veces", () => {
  const saved = sequence([1], "s"),
    fresh = candidates(sequence([1, 1], "n"));
  fresh.forEach((c) => (c.decision = { targetId: saved[0].id }));
  expect(reconcileImport(fresh, saved).every((c) => c.blocking)).toBe(true);
  fresh[1].selected = false;
  const reviewed = reconcileImport(fresh, saved);
  expect(reviewed[0].blocking).toBe(false);
  expect(reviewed[1].status).toBe("omit");
});
