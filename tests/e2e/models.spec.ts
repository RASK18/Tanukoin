import { test, expect } from "@playwright/test";

test("chat real WebGPU: consulta en español y arranque offline", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.TEST_LOCAL_CHAT !== "1",
    "Prueba optativa: requiere WebGPU y descarga aproximadamente 1 GB.",
  );
  test.setTimeout(360000);
  await page.goto("/Tanukoin/#/ia");
  const available = await page.evaluate(async () => {
    try {
      const adapter = await (navigator as any).gpu?.requestAdapter();
      return (
        !!adapter &&
        adapter.features.has("shader-f16") &&
        adapter.limits.maxStorageBufferBindingSize >= 128 * 1024 * 1024
      );
    } catch {
      return false;
    }
  });
  test.skip(
    !available,
    "El navegador de pruebas no dispone de WebGPU compatible.",
  );
  const model = page
    .locator(".model-card")
    .filter({ hasText: "Habla con Tanu" });
  await model
    .getByRole("button", { name: "Descargar modelo", exact: true })
    .click();
  await expect(model.getByText("Caché comprobada")).toBeVisible({
    timeout: 300000,
  });
  await context.setOffline(true);
  await page.reload();
  await model.getByRole("button", { name: "Comprobar offline" }).click();
  await expect(page.getByRole("status")).toContainText("Modelo comprobado", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  await page.getByLabel("Pregunta a Tanu").fill("Muéstrame mis suscripciones");
  await page.getByRole("button", { name: "Enviar pregunta" }).click();
  await expect(
    page.getByText("No hay recurrencias activas.", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
});

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
  await page.getByLabel("Archivo bancario").setInputFiles({
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
