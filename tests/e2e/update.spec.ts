import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

test("actualizar espera a cerrar la edición y conserva IndexedDB y cachés de modelos", async ({
  page,
}) => {
  let revision = 1;
  const root = resolve("dist");
  const types: Record<string, string> = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".webp": "image/webp",
    ".webmanifest": "application/manifest+json",
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, "http://localhost").pathname;
      const relative = pathname.replace(/^\/Tanukoin\//, "") || "index.html";
      const file = resolve(root, relative);
      if (!file.startsWith(root + sep)) {
        res.writeHead(404).end();
        return;
      }
      let body = await readFile(file);
      if (relative === "sw.js")
        body = Buffer.concat([
          body,
          Buffer.from(`\n// Test revision ${revision}`),
        ]);
      res
        .writeHead(200, {
          "Content-Type": types[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address() as { port: number };
    await page.goto(`http://127.0.0.1:${address.port}/Tanukoin/#/cuentas`);
    await page.getByRole("button", { name: "Crear mi primera cuenta" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Conservar");
    await page.getByRole("button", { name: "Guardar cuenta" }).click();
    await expect(
      page.getByRole("heading", { name: "Conservar" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const cache = await caches.open("tanukoin-embeddings-v1");
      await cache.put("/model-test", new Response("modelo conservado"));
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await page.getByRole("button", { name: "Editar Conservar" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Sin guardar");
    revision = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    await expect(
      page.getByRole("button", { name: "Actualizar ahora" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Actualizar ahora" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Actualizar ahora" }).click();
    await expect(
      page.getByRole("heading", { name: "Conservar" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actualizar ahora" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open("tanukoin-embeddings-v1");
        return (await cache.match("/model-test"))?.text();
      }),
    ).toBe("modelo conservado");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
