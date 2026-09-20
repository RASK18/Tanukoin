import { beforeEach, expect, it } from "vitest";
import { db, initialize } from "../src/data/db";
import { exportBackup, restoreBackup, validateBackup } from "../src/lib/backup";
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
  await db.settings.update("main", { maps: true });
  const raw = JSON.parse(await exportBackup());
  await db.accounts.clear();
  await restoreBackup(raw);
  expect(await db.accounts.count()).toBe(1);
  expect((await db.settings.get("main"))?.maps).toBe(false);
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
