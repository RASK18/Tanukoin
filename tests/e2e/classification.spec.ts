import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function choose(page: Page, label: string, text: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(text);
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function dragCategory(
  page: Page,
  source: string,
  targetId: string,
  inside: boolean,
  release = true,
) {
  const handle = page.getByRole("button", {
    name: "Mover " + source,
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const origin = (await handle.boundingBox())!;
  const sourceRow = handle.locator("xpath=ancestor::li[1]");
  const depth = Number(await sourceRow.getAttribute("data-depth"));
  const step = await page
    .locator(".category-editor-tree")
    .evaluate((el) =>
      parseFloat(getComputedStyle(el).getPropertyValue("--tree-indent")),
    );
  const x = origin.x + origin.width / 2,
    y = origin.y + origin.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 6, y, { steps: 2 });
  const target = page.locator('[data-category-id="' + targetId + '"]');
  await target.scrollIntoViewIfNeeded();
  const desired =
    Number(await target.getAttribute("data-depth")) + (inside ? 1 : 0);
  const dest = await target.evaluate((el) => ({
    top:
      el.parentElement!.getBoundingClientRect().top +
      (el as HTMLElement).offsetTop,
    height: (el as HTMLElement).offsetHeight,
  }));
  await page.mouse.move(
    x + (desired - depth) * step,
    dest.top + (inside ? dest.height - 3 : 3),
    { steps: 12 },
  );
  if (release) {
    await page.mouse.up();
    await expect(page.locator(".category-placeholder")).toHaveCount(0);
  }
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
  expect(backup.schemaVersion).toBe(3);
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
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Nombre de nueva categoría", { exact: true })
    .fill("Internacionales");
  await page.locator(".is-new").screenshot({
    path: "test-results/categories-new-child.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Mover Viajes → Transporte → Vuelos → Internacionales",
      exact: true,
    }),
  ).toBeVisible();
  await dragCategory(page, "Viajes → Transporte", "home", true);
  await expect(
    page.getByRole("button", {
      name: "Mover Vivienda → Transporte → Vuelos → Internacionales",
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
      name: "Mover Vivienda → Transporte → Vuelos",
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
    .getByLabel("Nombre de Transporte", { exact: true })
    .fill("Movilidad");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Mover Movilidad → Transporte público",
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

test("edita en línea, elige emojis, arrastra y conserva el orden al recargar", async ({
  page,
}) => {
  await seed(page);
  await page.goto("#/categorias");
  await page
    .getByLabel("Nombre de Alimentación", { exact: true })
    .fill("Temporal");
  await page
    .getByLabel("Nombre de Alimentación", { exact: true })
    .fill("Alimentación");
  await expect(
    page.getByRole("button", { name: "Mover Alimentación", exact: true }),
  ).toBeEnabled();
  const food = page.getByRole("form", {
    name: "Editar Alimentación",
    exact: true,
  });
  await food
    .getByLabel("Nombre de Alimentación", { exact: true })
    .fill("Comida");
  await food
    .getByRole("button", { name: "Emoji de Alimentación", exact: true })
    .click();
  await page.getByLabel("Buscar emoji").fill("pizza");
  await page.getByRole("button", { name: "Pizza", exact: true }).click();
  await food
    .getByLabel("Color de Alimentación", { exact: true })
    .fill("#aabbcc");
  await food.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Emoji de Comida", exact: true }),
  ).toContainText("🍕");
  await page
    .getByRole("button", {
      name: "Descripción para la IA de Comida",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Descripción para la IA", exact: true })
    .fill("Comidas ficticias");
  await page.getByRole("button", { name: "Guardar descripción" }).click();
  await page
    .getByRole("button", {
      name: "Añadir categoría dentro de Comida",
      exact: true,
    })
    .click();
  await page.getByLabel("Nombre de nueva categoría").fill("Descartada");
  await page.getByRole("button", { name: "Cancelar nueva categoría" }).click();
  await expect(page.locator('input[value="Descartada"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Contraer todo", exact: true })
    .click();
  await dragCategory(page, "Vivienda", "food", false, false);
  await expect(page.locator(".category-placeholder")).toHaveAttribute(
    "data-preview-index",
    "0",
  );
  await expect(page.locator(".category-columns")).toBeVisible();
  await expect(page.locator(".category-drop")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/categories-drag-preview.png",
    animations: "disabled",
  });
  await page.mouse.up();
  await expect(page.locator("[data-category-id]").first()).toHaveAttribute(
    "data-category-id",
    "home",
  );
  await page.reload();
  await expect(page.locator("[data-category-id]").first()).toHaveAttribute(
    "data-category-id",
    "home",
  );
  // Keyboard: move below the last child, then outdent to a root.
  await page
    .getByRole("button", { name: "Mover Comida → Restaurantes", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Nombre de Restaurantes", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await dragCategory(page, "Restaurantes", "food", true);
  await expect(
    page.getByLabel("Nombre de Comida → Restaurantes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Contraer todo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Emoji de Comida", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const popup = await page
    .getByRole("group", { name: "Elegir emoji" })
    .boundingBox();
  expect(popup!.x).toBeGreaterThanOrEqual(0);
  expect(popup!.x + popup!.width).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Cerrar aviso" }).click();
  await page
    .getByRole("button", { name: "Emoji de Comida", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/categories-inline-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/categories-inline-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
});

test.describe("Interacción táctil de categorías", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("arrastra con tacto manteniendo visible el árbol", async ({
    page,
    context,
  }) => {
    await seed(page);
    await page.goto("#/categorias");
    await page
      .getByRole("button", { name: "Contraer todo", exact: true })
      .tap();
    const handle = page.getByRole("button", {
      name: "Mover Compras",
      exact: true,
    });
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    const session = await context.newCDPSession(page);
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 12, y }],
    });
    const target = page.locator('[data-category-id="food"]');
    await target.scrollIntoViewIfNeeded();
    const drop = await target.evaluate((el) => ({
      top:
        el.parentElement!.getBoundingClientRect().top +
        (el as HTMLElement).offsetTop,
      height: (el as HTMLElement).offsetHeight,
    }));
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 20, y: drop.top + drop.height - 3 }],
    });
    await expect(page.locator(".category-placeholder")).toHaveAttribute(
      "data-preview-parent",
      "food",
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByLabel("Nombre de Alimentación → Compras", { exact: true }),
    ).toBeVisible();
    await session.detach();
  });
});

test("muestra jerarquía sin rutas, respeta hover y permite cancelar la reorganización", async ({
  page,
}) => {
  await seed(page);
  await page.goto("#/categorias");
  await page.mouse.move(0, 0);
  const name = page.getByLabel("Nombre de Alimentación", { exact: true });
  await expect(name).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await name.hover();
  await expect(name).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(
    page
      .getByRole("button", { name: "Emoji de Alimentación", exact: true })
      .locator("svg"),
  ).toHaveCount(0);
  const child = page.locator('[data-category-id="restaurants"]');
  await expect(child.locator(".tree-guide.elbow")).toHaveCount(1);
  await expect(child).not.toContainText("Alimentación");
  await page.getByLabel("Buscar categorías").fill("vuelos");
  await expect(page.locator("[data-category-id]")).toHaveCount(3);
  await page.getByLabel("Buscar categorías").fill("");
  await page.getByLabel("Buscar categorías").blur();
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 1672, height: 960 });
  await page.screenshot({
    path: "test-results/categories-reference-desktop.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Contraer todo", exact: true })
    .click();
  const original = await page
    .locator("[data-category-id]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-category-id")));
  const firstTop = await page
    .locator('[data-category-id="food"]')
    .evaluate((el) => (el as HTMLElement).offsetTop);
  await dragCategory(page, "Vivienda", "food", false, false);
  expect(
    await page
      .locator('[data-category-id="food"]')
      .evaluate((el) => (el as HTMLElement).offsetTop),
  ).toBeGreaterThan(firstTop);
  const second = page.locator('[data-category-id="shopping"]');
  const nextGap = await second.evaluate((el) => ({
    x: el.getBoundingClientRect().left + 26,
    y:
      el.parentElement!.getBoundingClientRect().top +
      (el as HTMLElement).offsetTop +
      3,
  }));
  await page.mouse.move(nextGap.x, nextGap.y, { steps: 10 });
  await expect(page.locator(".category-placeholder")).toHaveAttribute(
    "data-preview-index",
    "1",
  );
  expect(
    await page
      .locator('[data-category-id="food"]')
      .evaluate((el) => (el as HTMLElement).offsetTop),
  ).toBe(firstTop);
  const storedOrder = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("tanukoin");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const result = await new Promise<any>((resolve, reject) => {
      const r = database
        .transaction("categories")
        .objectStore("categories")
        .get("home");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    database.close();
    return result.order;
  });
  expect(storedOrder).toBeUndefined();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page
      .locator("[data-category-id]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-category-id"))),
  ).toEqual(original);
  await page.reload();
  await expect(page.locator('[data-depth="0"]')).toHaveCount(original.length);
  expect(
    await page
      .locator('[data-depth="0"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-category-id"))),
  ).toEqual(original);
});
