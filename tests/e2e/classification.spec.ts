import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function choose(page: Page, label: string, text: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(text);
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function seed(page: Page) {
  await page.goto("/Tanukoin/");
  await expect(
    page.getByRole("heading", { name: "Tu dinero, con perspectiva" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("tanukoin");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(
        ["accounts", "movements", "tags", "rules"],
        "readwrite",
      );
      tx.objectStore("accounts").put({
        id: "a",
        name: "Principal",
        bank: "Ficticio",
        currency: "EUR",
      });
      tx.objectStore("tags").put({
        id: "japan",
        name: "Vacaciones Japón",
        normalizedName: "vacaciones japon",
      });
      tx.objectStore("tags").put({
        id: "laura",
        name: "Laura",
        normalizedName: "laura",
      });
      for (const [id, description, amount, categoryId, tagIds] of [
        ["flight", "Iberia ficticia", -24700, "flights", ["japan", "laura"]],
        ["hotel", "Hotel ficticio", -82000, "hotel", ["japan"]],
        ["direct", "Viaje directo", -3000, "travel", []],
        ["metro", "Metro ficticio", -500, "public-transport", ["laura"]],
      ] as const)
        tx.objectStore("movements").put({
          id,
          description,
          amount,
          categoryId,
          tagIds: [...tagIds],
          categorySource: "rule",
          accountId: "a",
          currency: "EUR",
          date: "2026-09-15",
          merchant: "",
          notes: "",
          source: "ficticio",
          fingerprint: id,
          createdAt: "2026-09-15",
        });
      tx.objectStore("rules").put({
        id: "flight-rule",
        name: "Regla ficticia",
        enabled: true,
        priority: 1,
        descriptionContains: "Iberia",
        merchantContains: "",
        categoryId: "flights",
        note: "",
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });
  await page.reload();
}

test("importa, categoriza por teclado, crea etiquetas sin duplicados y descarta cambios", async ({
  page,
}) => {
  await page.goto("/Tanukoin/#/cuentas");
  await page.getByRole("button", { name: "Crear mi primera cuenta" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Principal");
  await page.getByRole("button", { name: "Guardar cuenta" }).click();
  await page.goto("#/movimientos");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page.getByLabel("Archivo bancario").setInputFiles({
    name: "ficticio.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Fecha;Concepto;Importe\n15/09/2026;Iberia ficticia;-247,00\n",
    ),
  });
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await page.getByRole("button", { name: "Importar 1 movimientos" }).click();
  await page.getByRole("button", { name: "Editar Iberia ficticia" }).click();
  const category = page.getByRole("combobox", {
    name: "Categoría",
    exact: true,
  });
  await category.fill("vuelo");
  await expect(
    page.getByRole("option", {
      name: "Viajes → Transporte → Vuelos",
      exact: true,
    }),
  ).toBeVisible();
  await category.press("Enter");
  const tags = page.getByRole("combobox", {
    name: "Buscar etiquetas",
    exact: true,
  });
  await tags.fill("Vacaciones Japón");
  await tags.press("Enter");
  await tags.fill("Laura");
  await tags.press("Enter");
  await tags.fill(" vacaciones  JAPON ");
  await expect(page.getByRole("option", { name: /Crear/ })).toHaveCount(0);
  await tags.press("Enter");
  await tags.press("Escape");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Iberia ficticia" });
  await expect(row).toContainText("Vacaciones Japón");
  await expect(row).toContainText("Laura");
  await page.getByRole("button", { name: "Editar Iberia ficticia" }).click();
  await tags.fill("Etiqueta descartada");
  await tags.press("Enter");
  await tags.press("Escape");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("Etiqueta descartada", { exact: true }),
  ).toHaveCount(0);
  await page.goto("#/etiquetas");
  await expect(
    page.getByRole("button", { name: "Editar Vacaciones Japón", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Etiqueta descartada", { exact: true }),
  ).toHaveCount(0);
});

test("filtra ramas y etiquetas, edita en lote y exporta/restaura el formato nuevo", async ({
  page,
}) => {
  await seed(page);
  await page.goto("#/movimientos");
  await choose(page, "Filtrar categoría", "Viajes", "Viajes");
  await expect(page.getByText("3 movimientos", { exact: true })).toBeVisible();
  await choose(page, "Filtrar etiquetas", "Japón", "Vacaciones Japón");
  await page
    .getByRole("combobox", { name: "Filtrar etiquetas", exact: true })
    .press("Escape");
  await expect(page.getByText("2 movimientos", { exact: true })).toBeVisible();
  await choose(page, "Filtrar etiquetas", "Laura", "Laura");
  await page
    .getByRole("combobox", { name: "Filtrar etiquetas", exact: true })
    .press("Escape");
  await expect(page.getByText("1 movimientos", { exact: true })).toBeVisible();
  await page.getByLabel("Coincidencia de etiquetas").selectOption("any");
  await expect(page.getByText("2 movimientos", { exact: true })).toBeVisible();
  await page.getByLabel("Coincidencia de etiquetas").selectOption("none");
  await expect(page.getByText("1 movimientos", { exact: true })).toBeVisible();
  await page.getByLabel("Coincidencia de etiquetas").selectOption("any");
  await page.getByRole("checkbox", { name: "Seleccionar página" }).check();
  await choose(page, "Etiquetas para el lote", "Laura", "Laura");
  await page
    .getByRole("combobox", { name: "Etiquetas para el lote" })
    .press("Escape");
  await page
    .getByRole("button", { name: "Añadir etiquetas", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "Hotel ficticio" }),
  ).toContainText("Laura");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain("Viajes → Transporte → Vuelos");
  expect(csv).toContain("Vacaciones Japón | Laura");
  await page.goto("#/ajustes");
  const backupPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia completa" }).click();
  const backupPath = (await (await backupPromise).path())!;
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup.schemaVersion).toBe(2);
  expect(backup.data.tags).toHaveLength(2);
  expect(
    backup.data.movements.find((m: any) => m.id === "hotel").categorySource,
  ).toBe("rule");
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  await page
    .getByRole("button", { name: "Sustituir datos y restaurar" })
    .click();
  await page.goto("#/movimientos");
  await page.getByLabel("Filtrar movimientos").fill("Vacaciones Japon");
  await expect(page.getByText("2 movimientos", { exact: true })).toBeVisible();
});

test("crea un cuarto nivel, mueve ramas y confirma la eliminación con su impacto", async ({
  page,
}) => {
  await seed(page);
  await page.goto("#/categorias");
  await page
    .getByRole("button", {
      name: "Añadir categoría dentro de Viajes → Transporte → Vuelos",
      exact: true,
    })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Internacionales");
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar Viajes → Transporte → Vuelos → Internacionales",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Viajes → Transporte", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Categoría padre", exact: true })
    .fill("Vuelos");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(0);
  await choose(page, "Categoría padre", "Vivienda", "Vivienda");
  await expect(page.getByRole("dialog")).toContainText(
    "Se moverá toda la rama",
  );
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar Vivienda → Transporte → Vuelos → Internacionales",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Eliminar Vivienda → Transporte",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "1 movimientos quedarán sin categoría",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "1 reglas se eliminarán",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar Vivienda → Transporte → Vuelos",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Eliminar Vivienda → Transporte",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Eliminar rama", exact: true })
    .click();
  await page.goto("#/movimientos");
  const row = page.getByRole("row").filter({ hasText: "Iberia ficticia" });
  await expect(row).toContainText("Sin categorizar");
  await expect(row).toContainText("Vacaciones Japón");
  await page.goto("#/reglas");
  await expect(page.getByText("Regla ficticia", { exact: true })).toHaveCount(
    0,
  );
});

test("el resumen desglosa categorías, aplica etiquetas y funciona offline y en móvil", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  await page.getByLabel("Mes del resumen").fill("2026-09");
  const chart = page.locator("section").filter({
    has: page.getByRole("heading", { name: "¿Dónde se va tu dinero?" }),
  });
  await expect(chart.locator(".donut-center")).toContainText("1102,00");
  await chart.getByRole("button", { name: "Viajes", exact: true }).click();
  await expect(chart.locator(".donut-center")).toContainText("1097,00");
  await expect(chart).toContainText("Asignados directamente");
  await choose(page, "Filtrar etiquetas", "Japón", "Vacaciones Japón");
  await page
    .getByRole("combobox", { name: "Filtrar etiquetas" })
    .press("Escape");
  await expect(chart.locator(".donut-center")).toContainText("1067,00");
  // Allow the Recharts JavaScript animation to finish before visual review.
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    animations: "disabled",
    path: "test-results/classification-summary-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "test-results/classification-summary-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await context.setOffline(true);
  await page.reload();
  await page.goto("#/movimientos");
  await page.getByRole("button", { name: "Editar Iberia ficticia" }).click();
  await page.getByRole("button", { name: "Quitar Laura", exact: true }).click();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: "Iberia ficticia" });
  await expect(row).toContainText("Vacaciones Japón");
  await expect(row).not.toContainText("Laura");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/classification-movements-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("renombra y elimina etiquetas con revisión, y gestiona categorías a 320 px", async ({
  page,
}) => {
  await seed(page);
  await page.goto("#/etiquetas");
  await page
    .getByRole("button", { name: "Editar Vacaciones Japón", exact: true })
    .click();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill("Vacaciones Japón 2026");
  await page.getByRole("button", { name: "Guardar etiqueta" }).click();
  await page.getByRole("button", { name: "Nueva etiqueta" }).click();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill(" vacaciones  JAPON 2026 ");
  await page.getByRole("button", { name: "Guardar etiqueta" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Ya existe la etiqueta",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Eliminar Vacaciones Japón 2026",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText("de 2 movimientos");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Eliminar Vacaciones Japón 2026",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Eliminar etiqueta", exact: true })
    .click();
  await page.goto("#/movimientos");
  const row = page.getByRole("row").filter({ hasText: "Iberia ficticia" });
  await expect(row).toContainText("Laura");
  await expect(row).toContainText("Vuelos");
  await expect(row).not.toContainText("Vacaciones Japón");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("#/categorias");
  await page
    .getByRole("button", { name: "Editar Transporte", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Movilidad");
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await expect(
    page.getByRole("button", {
      name: "Editar Movilidad → Transporte público",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Contraer todo", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/classification-tree-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("#/movimientos");
  await page.getByRole("button", { name: "Editar Iberia ficticia" }).click();
  await page
    .getByRole("combobox", { name: "Categoría", exact: true })
    .fill("vuelo");
  await expect(
    page.getByRole("option", { name: "Viajes → Transporte → Vuelos" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/classification-editor-mobile.png",
    animations: "disabled",
  });
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
