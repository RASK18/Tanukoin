import { test, expect } from "@playwright/test";

test("embeddings reales: descarga, arranque frío offline y búsqueda semántica", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.TEST_LOCAL_MODEL !== "1",
    "Prueba optativa: descarga aproximadamente 118 MB.",
  );
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/Tanukoin/#/ia");
  const model = page
    .locator(".model-card")
    .filter({ hasText: "Orden y búsqueda inteligente" });
  await model
    .getByRole("button", { name: "Descargar modelo", exact: true })
    .click();
  await expect(model.getByText("Caché comprobada")).toBeVisible({
    timeout: 240000,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await model.getByRole("button", { name: "Comprobar offline" }).click();
  await expect(page.getByRole("status")).toContainText("Modelo comprobado", {
    timeout: 45000,
  });
  await page.goto("#/cuentas");
  await page.getByRole("button", { name: "Crear mi primera cuenta" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Principal");
  await page.getByRole("button", { name: "Guardar cuenta" }).click();
  await page.goto("#/movimientos");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .getByLabel("Archivo bancario")
    .setInputFiles({
      name: "ejemplo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Fecha;Concepto;Importe\n15/09/2026;Compra supermercado;-30,00\n16/09/2026;Billete de tren;-20,00",
      ),
    });
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await page.getByRole("button", { name: "Importar 2 movimientos" }).click();
  await expect(
    page.getByText("Compra supermercado", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page.getByLabel("Filtrar movimientos").fill("supermercado");
  await page
    .getByRole("button", { name: "Búsqueda semántica", exact: true })
    .click();
  await expect(
    page.getByText("Compra supermercado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/movimientos · búsqueda semántica/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
