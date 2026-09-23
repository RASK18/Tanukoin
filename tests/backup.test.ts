import { beforeEach, expect, it } from "vitest";
import { db, initialize } from "../src/data/db";
import { exportBackup, restoreBackup, validateBackup } from "../src/lib/backup";
import { buildCandidates, defaultLayout } from "../src/features/import/parse";
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
    externalId: "cuenta-bancaria-ficticia",
  });
  await db.settings.update("main", {
    maps: true,
    hideImportWelcome: true,
    hideTanuWelcome: false,
    cpuThreads: 6,
  });
  const profile = {
    ...defaultLayout,
    columns: { ...defaultLayout.columns, balance: 3 },
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
  await db.movements.add({
    ...imported.candidates[0].movement,
    secondaryDate: "2026-09-21",
    time: "12:34:56",
    secondaryTime: "09:15:00",
    originalAmount: 500,
    originalCurrency: "JPY",
    fee: 25,
    exchangeRate: "1 EUR = 160.123456789 JPY",
  });
  const raw = JSON.parse(await exportBackup());
  expect(raw.schemaVersion).toBe(3);
  expect(raw.data).not.toHaveProperty("profiles");
  await db.accounts.clear();
  await restoreBackup(raw);
  expect(await db.accounts.count()).toBe(1);
  expect((await db.accounts.get("a"))?.externalId).toBe(
    "cuenta-bancaria-ficticia",
  );
  expect(raw.data.movements[0]).not.toHaveProperty("externalId");
  expect((await db.settings.get("main"))?.maps).toBe(false);
  expect((await db.settings.get("main"))?.hideImportWelcome).toBe(true);
  expect((await db.settings.get("main"))?.hideTanuWelcome).toBe(false);
  expect((await db.settings.get("main"))?.cpuThreads).toBe(6);
  expect((await db.movements.toArray())[0].balance).toBe(10000);
  expect((await db.movements.toArray())[0]).toMatchObject({
    secondaryDate: "2026-09-21",
    time: "12:34:56",
    secondaryTime: "09:15:00",
    originalAmount: 500,
    originalCurrency: "JPY",
    fee: 25,
    exchangeRate: "1 EUR = 160.123456789 JPY",
  });
  const valid = structuredClone(raw);
  for (const update of [
    { fee: -1 },
    { fee: 1.5 },
    { fee: "25" },
    { fee: null },
    { fee: Number.MAX_SAFE_INTEGER + 1 },
    { exchangeRate: 1.25 },
    { exchangeRate: "" },
    { exchangeRate: "NaN" },
    { exchangeRate: "0" },
    { exchangeRate: "1 EUR = -2 USD" },
    { exchangeRate: "instrucciones arbitrarias" },
    { originalAmount: 1.5 },
    { originalAmount: undefined },
    { originalCurrency: undefined },
    { originalCurrency: "usd" },
    { externalId: "operacion-no-admitida" },
    { timestamp: "2026-09-20T12:34:56Z" },
    { time: "24:00:00" },
    { time: "12:34:56Z" },
    { time: "" },
    { time: 120000 },
    { secondaryTime: "09:60:00" },
    { secondaryDate: undefined, secondaryTime: "09:15:00" },
    { description: "Pago a ES00" + "0".repeat(20) },
    { merchant: "Persona ficticia, ES00 " + "0000 ".repeat(5).trim() },
    { notes: "IBAN: GB00FAKE" + "0".repeat(14) },
    { secondaryDate: "2026-02-31" },
    { secondaryDate: "2026-09-19" },
  ]) {
    const invalid = structuredClone(valid);
    Object.assign(invalid.data.movements[0], update);
    await expect(restoreBackup(invalid)).rejects.toThrow();
    expect((await db.movements.toArray())[0].originalAmount).toBe(500);
  }
  raw.data.movements[0].balance = "100";
  expect(() => validateBackup(raw)).toThrow();
});
it("acepta preferencias opcionales ausentes y rechaza valores inválidos", async () => {
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
  raw.schemaVersion = 999;
  expect(() => validateBackup(raw)).toThrow();
  for (const schemaVersion of [1, 2]) {
    raw.schemaVersion = schemaVersion;
    await expect(restoreBackup(raw)).rejects.toThrow("esquema 3");
    expect((await db.accounts.get("a"))?.name).toBe("Original");
  }
});
