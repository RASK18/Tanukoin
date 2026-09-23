// Optional local acceptance check. Inputs stay outside the repository and HTTP server.
// No traces, screenshots, downloads, extracted rows, or personal paths are logged.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, basename, extname, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const files = process.argv.slice(2);
const expected =
  process.env.TANUKOIN_IMPORT_EXPECTED_COUNTS?.split(",").map(Number);
if (
  !files.length ||
  (expected &&
    (expected.length !== files.length ||
      expected.some((n) => !Number.isInteger(n) || n < 1)))
) {
  console.error(
    "Uso: node scripts/check-import-files.mjs <archivo> [...archivos]. Opcional: TANUKOIN_IMPORT_EXPECTED_COUNTS con recuentos separados por comas.",
  );
  process.exit(1);
}
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const path = resolve(
      root,
      decodeURIComponent(url.pathname.replace(/^\/Tanukoin\//, "")) ||
        "index.html",
    );
    if (!path.startsWith(root + sep)) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
let browser;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel:
      process.env.TEST_BROWSER_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
  });
  for (let index = 0; index < files.length; index++) {
    const context = await browser.newContext({ serviceWorkers: "block" });
    let external = 0,
      stage = "apertura";
    try {
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin === origin)
          return route.continue();
        external++;
        return route.abort();
      });
      const page = await context.newPage();
      await page.goto(`${origin}/Tanukoin/#/movimientos`);
      await page.getByRole("button", { name: "Importar", exact: true }).click();
      await page
        .getByRole("button", { name: "Crear cuenta", exact: true })
        .click();
      const account = page.getByRole("dialog", {
        name: "Nueva cuenta",
        exact: true,
      });
      await account
        .getByLabel("Nombre", { exact: true })
        .fill("Cuenta de comprobación local");
      await account.getByRole("button", { name: "Guardar cuenta" }).click();
      stage = "lectura";
      await page
        .getByLabel("Archivo bancario")
        .setInputFiles({
          name: basename(files[index]),
          mimeType: "application/octet-stream",
          buffer: await readFile(files[index]),
        });
      const review = page.getByRole("button", {
        name: "Revisar movimientos",
        exact: true,
      });
      await expect(review).toBeEnabled({ timeout: 60000 });
      stage = "revisión";
      await review.click();
      const save = page.getByRole("button", {
        name: /^Importar \d+ movimientos$/,
      });
      const count = Number((await save.innerText()).match(/\d+/)[0]);
      if (expected && count !== expected[index])
        throw new Error("Recuento distinto");
      stage = "guardado";
      await save.click();
      await expect(
        page.getByRole("dialog", { name: "Importar movimientos", exact: true }),
      ).not.toBeVisible({ timeout: 60000 });
      const valid = await page.evaluate(async (count) => {
        const request = indexedDB.open("tanukoin");
        const database = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error("Lectura fallida"));
        });
        const tx = database.transaction(["movements", "models"]);
        const movementRequest = tx.objectStore("movements").getAll();
        const modelRequest = tx.objectStore("models").count();
        const [movements, modelCount] = await Promise.all([
          new Promise((resolve, reject) => {
            movementRequest.onsuccess = () => resolve(movementRequest.result);
            movementRequest.onerror = () =>
              reject(new Error("Lectura fallida"));
          }),
          new Promise((resolve, reject) => {
            modelRequest.onsuccess = () => resolve(modelRequest.result);
            modelRequest.onerror = () => reject(new Error("Lectura fallida"));
          }),
        ]);
        database.close();
        return (
          movements.length === count &&
          modelCount === 0 &&
          movements.every(
            (m) =>
              Number.isSafeInteger(m.amount) &&
              (m.balance === undefined || Number.isSafeInteger(m.balance)) &&
              m.description.trim() &&
              m.currency === "EUR" &&
              /^\d{4}-\d{2}-\d{2}$/.test(m.date),
          )
        );
      }, count);
      if (!valid || external) throw new Error("Comprobación fallida");
      console.log(
        `Archivo ${index + 1}: lectura, revisión y guardado correctos, sin modelos ni solicitudes externas.`,
      );
    } catch {
      process.exitCode = 1;
      console.error(
        `Archivo ${index + 1}: comprobación fallida en ${stage}. No se han registrado sus datos.`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
