import { beforeEach, expect, it } from "vitest";
import { db, initialize } from "../src/data/db";
import { exportBackup, restoreBackup, validateBackup } from "../src/lib/backup";
import { buildCandidates, defaultProfile } from "../src/features/import/parse";
beforeEach(async () => {
  await db.delete();
  await db.open();
  await initialize();
});
it("restaura datos atómicamente y no restaura consentimientos de red", async () => {
  await db.accounts.add({
    id: "a",
    name: "Principal",
    bank: "Banco",
    currency: "EUR",
  });
  await db.settings.update("main", {
    maps: true,
    hideImportWelcome: true,
    hideTanuWelcome: false,
    cpuThreads: 6,
  });
  const profile = {
    ...defaultProfile,
    columns: { ...defaultProfile.columns, balance: 3 },
  };
  const imported = buildCandidates(
    [
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["20/09/2026", "Compra", "-2,50", "100,00"],
    ],
    profile,
    (await db.accounts.get("a"))!,
    "ficticio.csv",
    [],
  );
  await db.movements.add(imported.candidates[0].movement);
  const raw = JSON.parse(await exportBackup());
  await db.accounts.clear();
  await restoreBackup(raw);
  expect(await db.accounts.count()).toBe(1);
  expect((await db.settings.get("main"))?.maps).toBe(false);
  expect((await db.settings.get("main"))?.hideImportWelcome).toBe(true);
  expect((await db.settings.get("main"))?.hideTanuWelcome).toBe(false);
  expect((await db.settings.get("main"))?.cpuThreads).toBe(6);
  expect((await db.movements.toArray())[0].balance).toBe(10000);
  raw.data.movements[0].balance = "100";
  expect(() => validateBackup(raw)).toThrow();
});
it("acepta copias antiguas y rechaza preferencias de bienvenida inválidas", async () => {
  const previousSettings = await db.settings.get("main");
  const raw = JSON.parse(await exportBackup());
  raw.data.settings[0].timezone = "Pacific/Auckland";
  expect(() => validateBackup(raw)).not.toThrow();
  for (const key of ["hideImportWelcome", "hideTanuWelcome"]) {
    raw.data.settings[0][key] = "true";
    await expect(restoreBackup(raw)).rejects.toThrow(
      "Preferencia de bienvenida",
    );
    expect(await db.settings.get("main")).toEqual(previousSettings);
    delete raw.data.settings[0][key];
  }
});
it("rechaza campos secretos, referencias rotas y versiones desconocidas sin borrar datos", async () => {
  await db.accounts.add({
    id: "a",
    name: "Original",
    bank: "",
    currency: "EUR",
  });
  const raw = JSON.parse(await exportBackup());
  raw.data.accounts[0].privateKey = "secret";
  expect(() => validateBackup(raw)).toThrow();
  await expect(restoreBackup(raw)).rejects.toThrow();
  expect((await db.accounts.get("a"))?.name).toBe("Original");
  delete raw.data.accounts[0].privateKey;
  raw.schemaVersion = 2;
  expect(() => validateBackup(raw)).toThrow();
});
