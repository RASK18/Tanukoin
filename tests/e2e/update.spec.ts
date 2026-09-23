import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { generateSW } from "workbox-build";

test("actualizar espera a cerrar la edición y conserva IndexedDB y cachés de modelos", async ({
  page,
}) => {
  let revision = 1;
  const root = resolve("dist");
  const legacyDirectory = await mkdtemp(
    resolve(tmpdir(), "tanukoin-legacy-sw-"),
  );
  const legacyFile = resolve(legacyDirectory, "sw.js");
  await generateSW({
    swDest: legacyFile,
    globDirectory: root,
    globPatterns: [
      "**/*.{js,mjs,css,html,json,wasm,bin,webp,png,bcmap,pfb,ttf,woff2,webmanifest}",
    ],
    globIgnores: ["sw.js", "version.json", "extension/**"],
    maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
    inlineWorkboxRuntime: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    navigateFallback: "/Tanukoin/index.html",
    navigateFallbackDenylist: [/bank-callback\.html/, /prueba-cpu\.html/],
  });
  const legacyWorker = await readFile(legacyFile);
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
      if (relative === "sw.js" && revision === 1) body = legacyWorker;
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
    await page.evaluate(() => {
      location.hash = "#/movimientos";
    });
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Nueva cuenta", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const importer = page.getByRole("dialog", {
      name: "Importar movimientos",
      exact: true,
    });
    await expect(importer).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actualizar ahora" }),
    ).toBeDisabled();
    await importer.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.evaluate(() => {
      location.hash = "#/cuentas";
    });
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
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open("tanukoin-embeddings-v1");
        return (await cache.match("/model-test"))?.text();
      }),
    ).toBe("modelo conservado");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    if (legacyDirectory.startsWith(resolve(tmpdir(), "tanukoin-legacy-sw-")))
      await rm(legacyDirectory, { recursive: true, force: true });
  }
});
