// Optional local acceptance check. Inputs stay outside the repository and HTTP server.
// No traces, screenshots, downloads, extracted rows, or personal paths are logged.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, basename, extname, sep } from "node:path";
import { chromium, expect } from "@playwright/test";
import Papa from "papaparse";

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
      const buffer = await readFile(files[index]);
      const expectedFields = {};
      if (extname(files[index]).toLowerCase() === ".csv") {
        const sourceRows = Papa.parse(buffer.toString("utf8"), {
          skipEmptyLines: "greedy",
        }).data;
        const first = sourceRows[0].indexOf("Fecha de inicio");
        const second = sourceRows[0].indexOf("Fecha de finalización");
        const feeColumn = sourceRows[0].indexOf("Comisión");
        if (first >= 0 && second >= 0)
          sourceRows.slice(1).forEach((row, i) => {
            const dates = [row[first], row[second]].filter(Boolean).sort();
            if (
              dates.length > 0 &&
              dates.every((d) =>
                /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d),
              )
            )
              expectedFields[i + 2] = {
                date: dates[0].slice(0, 10),
                time: dates[0].slice(11),
                secondaryDate: dates[1]?.slice(0, 10),
                secondaryTime: dates[1]?.slice(11),
                ...(feeColumn >= 0 && row[feeColumn]?.trim()
                  ? {
                      fee: Math.round(
                        Number(row[feeColumn].replace(",", ".")) * 100,
                      ),
                    }
                  : {}),
              };
          });
      }
      await page.getByLabel("Archivo bancario").setInputFiles({
        name: basename(files[index]),
        mimeType: "application/octet-stream",
        buffer,
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
      stage = "orden tras recarga";
      await page.reload();
      await expect(page.locator('button[aria-label^="Editar "]')).toHaveCount(
        Math.min(count, 30),
      );
      const valid = await page.evaluate(
        async ({ count, expectedFields }) => {
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
          const byId = new Map(movements.map((m) => [m.id, m]));
          const groups = new Map();
          for (const m of movements) {
            const key = JSON.stringify([m.accountId, m.currency]);
            groups.set(key, [...(groups.get(key) || []), m]);
          }
          const orderValid = [...groups.values()].every((rows) => {
            rows.sort((a, b) => a.order?.rank - b.order?.rank);
            return rows.every(
              (m, i) =>
                m.order &&
                m.order.rank === i &&
                m.sourcePosition &&
                [1, -1].includes(m.sourcePosition.direction) &&
                (i === 0 ||
                  (m.sourcePosition.position -
                    rows[i - 1].sourcePosition.position) *
                    m.sourcePosition.direction >
                    0) &&
                m.order.after.every((id) => {
                  const before = byId.get(id);
                  return (
                    before &&
                    before.accountId === m.accountId &&
                    before.currency === m.currency &&
                    before.order.rank < m.order.rank
                  );
                }) &&
                (i === 0 ||
                  m.order.uncertain ||
                  rows[i - 1].order.uncertain ||
                  m.balance === undefined ||
                  rows[i - 1].balance === undefined ||
                  // Only originally adjacent operations provide a continuity check.
                  (m.sourcePosition.previousPosition !==
                    rows[i - 1].sourcePosition.position &&
                    rows[i - 1].sourcePosition.previousPosition !==
                      m.sourcePosition.position) ||
                  rows[i - 1].balance + m.amount === m.balance),
            );
          });
          movements.sort(
            (a, b) =>
              b.accountId.localeCompare(a.accountId) ||
              b.currency.localeCompare(a.currency) ||
              b.order.rank - a.order.rank ||
              b.date.localeCompare(a.date) ||
              b.createdAt.localeCompare(a.createdAt) ||
              b.id.localeCompare(a.id),
          );
          const buttons = [
            ...document.querySelectorAll('button[aria-label^="Editar "]'),
          ];
          const displayed =
            buttons.length === Math.min(count, 30) &&
            buttons.every(
              (button, i) =>
                button.getAttribute("aria-label") ===
                `Editar ${movements[i].description}`,
            );
          const privateText =
            /\b(?:ES\d{2}(?:\s*\d){20}|[A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/i;
          const sourceFieldsValid = movements.every(
            (m) =>
              !expectedFields[m.sourcePosition?.row] ||
              Object.entries(expectedFields[m.sourcePosition.row]).every(
                ([key, value]) => m[key] === value,
              ),
          );
          return {
            problem: !sourceFieldsValid
              ? "conservación de campos de origen"
              : !orderValid
                ? "orden y saldos"
                : !displayed
                  ? "presentación"
                  : "datos guardados",
            valid:
              sourceFieldsValid &&
              orderValid &&
              displayed &&
              movements.length === count &&
              modelCount === 0 &&
              movements.every(
                (m) =>
                  Number.isSafeInteger(m.amount) &&
                  (m.fee === undefined ||
                    (Number.isSafeInteger(m.fee) && m.fee >= 0)) &&
                  (m.exchangeRate === undefined ||
                    typeof m.exchangeRate === "string") &&
                  (m.secondaryDate === undefined ||
                    (/^\d{4}-\d{2}-\d{2}$/.test(m.secondaryDate) &&
                      m.secondaryDate >= m.date)) &&
                  !Object.hasOwn(m, "bookingDate") &&
                  !Object.hasOwn(m, "valueDate") &&
                  !Object.hasOwn(m, "completionDate") &&
                  !Object.hasOwn(m, "timestamp") &&
                  [m.time, m.secondaryTime].every(
                    (t) =>
                      t === undefined ||
                      /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?$/.test(t),
                  ) &&
                  (m.secondaryTime === undefined || !!m.secondaryDate) &&
                  ![m.description, m.merchant, m.notes].some((text) =>
                    privateText.test(text),
                  ) &&
                  ((m.originalAmount === undefined &&
                    m.originalCurrency === undefined) ||
                    (Number.isSafeInteger(m.originalAmount) &&
                      /^[A-Z]{3}$/.test(m.originalCurrency || ""))) &&
                  (m.balance === undefined ||
                    Number.isSafeInteger(m.balance)) &&
                  m.description.trim() &&
                  m.currency === "EUR" &&
                  /^\d{4}-\d{2}-\d{2}$/.test(m.date),
              ),
          };
        },
        { count, expectedFields },
      );
      if (!valid.valid || external) {
        stage = valid.problem;
        throw new Error("Comprobación fallida");
      }
      console.log(
        `Archivo ${index + 1}: lectura, guardado, orden, privacidad y recarga correctos, sin modelos ni solicitudes externas.`,
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
