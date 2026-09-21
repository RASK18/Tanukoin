import { test, expect } from "@playwright/test";

test("Timeline grande: revisión, descarte, guardado y reimportación sin duplicados", async ({
  page,
}) => {
  test.setTimeout(180000);
  const count = 225000;
  const locations = Array.from({ length: count }, (_, i) => ({
    latitudeE7: 404168000,
    longitudeE7: -37038000,
    timestampMs: String(Date.UTC(2026, 0, 1) + i * 60000),
  }));
  const file = {
    name: "historial-ficticio.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ locations })),
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("#/mapa");
  const input = page.locator('input[type="file"]');
  const preview = page.getByText(`${count} ubicaciones nuevas.`, { exact: false });
  const saved = page.getByText(`${count} puntos y estancias guardados`, {
    exact: true,
  });
  // Dos archivos solapados deben conservar una sola copia de cada ubicación.
  await input.setInputFiles([
    file,
    {
      ...file,
      name: "solapado.json",
      buffer: Buffer.from(JSON.stringify({ locations: locations.slice(0, 2) })),
    },
  ]);
  await expect(preview).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByText("0 puntos y estancias guardados", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(preview).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByText("0 puntos y estancias guardados", { exact: true }),
  ).toBeVisible();
  await input.setInputFiles(file);
  await expect(preview).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Confirmar importación", exact: true })
    .click();
  await expect(saved).toBeVisible({ timeout: 60000 });
  await expect(preview).not.toBeVisible();
  await page.reload();
  await expect(saved).toBeVisible({ timeout: 30000 });
  await input.setInputFiles(file);
  await expect(page.getByText(/^0 ubicaciones nuevas\./)).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "Confirmar importación", exact: true }),
  ).toBeDisabled();
  await expect(saved).toBeVisible();
  expect(errors).toEqual([]);
});
