// Local diagnostic only. Supply pairs of private files outside the repository.
// Originals and extracted movements stay in memory. No traces, screenshots or exports.
// Output contains aggregate counts only. Does not change the user's browser profile.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, basename, extname, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const files = process.argv.slice(2);
if (!files.length || files.length % 2) {
  console.error(
    "Uso: node scripts/check-import-pairs.mjs <formato-a> <formato-b> [...pares]",
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
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const path = resolve(
      root,
      decodeURIComponent(url.pathname.replace(/^\/Tanukoin\//, "")) ||
        "index.html",
    );
    if (!path.startsWith(root + sep)) return response.writeHead(404).end();
    response
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
const normalize = (s = "") =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const dates = (m) => [m.date, m.secondaryDate].filter(Boolean);
const fields = [
  "date",
  "secondaryDate",
  "time",
  "secondaryTime",
  "amount",
  "currency",
  "balance",
  "balanceSource",
  "description",
  "merchant",
  "notes",
  "originalAmount",
  "originalCurrency",
  "fee",
  "exchangeRate",
];
const present = (v) => v !== undefined && v !== null && v !== "";

async function stored(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("tanukoin");
        request.onerror = () => reject(new Error("Lectura fallida"));
        request.onsuccess = () => {
          const db = request.result;
          const query = db
            .transaction("movements")
            .objectStore("movements")
            .getAll();
          query.onsuccess = () => {
            db.close();
            resolve(query.result);
          };
          query.onerror = () => {
            db.close();
            reject(new Error("Lectura fallida"));
          };
        };
      }),
  );
}

async function review(page, file) {
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Importar movimientos",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Cuenta", exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Archivo bancario").setInputFiles({
    name: basename(file),
    mimeType: "application/octet-stream",
    buffer: await readFile(file),
  });
  const next = page.getByRole("button", {
    name: "Revisar movimientos",
    exact: true,
  });
  await expect(next).toBeEnabled({ timeout: 60000 });
  await next.click();
  await expect(page.locator(".import-review")).toBeVisible();
  // Synthetic opening total for this disposable test only, never a bank balance.
  const opening = page.getByLabel("Saldo antes del primer movimiento", {
    exact: true,
  });
  if (await opening.count()) await opening.fill("0");
  const numbers = await page
    .locator(".import-summary > span > strong")
    .allTextContents();
  return {
    selected: Number(numbers[0]),
    flagged: Number(numbers[1]),
    excluded: Number(numbers[2]),
  };
}

async function save(page, selected) {
  if (!selected) return;
  await page
    .getByRole("button", { name: /^Importar \d+ movimientos$/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Importar movimientos", exact: true }),
  ).not.toBeVisible({ timeout: 60000 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Importar", exact: true }),
  ).toBeVisible();
}

// These are diagnostic candidates, NOT a rule authorizing automatic merges.
// Mutual uniqueness prevents counting repeated same-day equal amounts as certain.
function compare(oldRows, incoming) {
  const compatible = (a, b) =>
    a.currency === b.currency &&
    a.amount === b.amount &&
    dates(a).some((d) => dates(b).includes(d)) &&
    (a.balance === undefined ||
      b.balance === undefined ||
      a.balanceSource ||
      b.balanceSource ||
      a.balance === b.balance);
  const candidates = incoming.map((m) =>
    oldRows.filter((old) => compatible(old, m)),
  );
  const pairs = [];
  let ambiguous = 0,
    unmatched = 0;
  for (let i = 0; i < incoming.length; i++) {
    if (!candidates[i].length) {
      unmatched++;
      continue;
    }
    if (
      candidates[i].length !== 1 ||
      candidates.filter((list) => list.includes(candidates[i][0])).length !== 1
    ) {
      ambiguous++;
      continue;
    }
    pairs.push([candidates[i][0], incoming[i]]);
  }
  const missing = {},
    different = {};
  const descriptionPatterns = {
    incomingContainsOld: 0,
    oldContainsIncoming: 0,
    punctuationOnly: 0,
    other: 0,
  };
  let conceptMismatch = 0,
    dateMismatch = 0,
    comparableBalances = 0;
  for (const [a, b] of pairs) {
    if (normalize(a.description) !== normalize(b.description)) {
      conceptMismatch++;
      const left = normalize(a.description),
        right = normalize(b.description);
      if (right.includes(left)) descriptionPatterns.incomingContainsOld++;
      else if (left.includes(right)) descriptionPatterns.oldContainsIncoming++;
      else if (
        left.replace(/[^\p{L}\p{N}]/gu, "") ===
        right.replace(/[^\p{L}\p{N}]/gu, "")
      )
        descriptionPatterns.punctuationOnly++;
      else descriptionPatterns.other++;
    }
    if (a.date !== b.date) dateMismatch++;
    if (
      a.balance !== undefined &&
      b.balance !== undefined &&
      !a.balanceSource &&
      !b.balanceSource
    )
      comparableBalances++;
    for (const field of fields) {
      if (!present(a[field]) && present(b[field]))
        missing[field] = (missing[field] || 0) + 1;
      else if (present(a[field]) && present(b[field]) && a[field] !== b[field])
        different[field] = (different[field] || 0) + 1;
    }
  }
  const sortedOld = [...oldRows].sort((a, b) => a.order.rank - b.order.rank);
  const sortedIncoming = [...incoming].sort(
    (a, b) => a.order.rank - b.order.rank,
  );
  const sequence =
    oldRows.length === incoming.length
      ? {
          length: oldRows.length,
          amountCurrencyDateAgrees: sortedOld.filter(
            (m, i) =>
              m.amount === sortedIncoming[i].amount &&
              m.currency === sortedIncoming[i].currency &&
              dates(m).some((d) => dates(sortedIncoming[i]).includes(d)),
          ).length,
          conceptMismatch: sortedOld.filter(
            (m, i) =>
              normalize(m.description) !==
              normalize(sortedIncoming[i].description),
          ).length,
        }
      : undefined;
  const balanceCoverage = (rows) => ({
    bank: rows.filter((m) => m.balance !== undefined && !m.balanceSource)
      .length,
    calculated: rows.filter((m) => m.balanceSource === "calculated").length,
    absent: rows.filter((m) => m.balance === undefined).length,
  });
  return {
    mutuallyUniqueCandidates: pairs.length,
    ambiguous,
    unmatched,
    comparableBalances,
    conceptMismatch,
    dateMismatch,
    descriptionPatterns,
    sequence,
    balances: {
      old: balanceCoverage(oldRows),
      incoming: balanceCoverage(incoming),
    },
    unmatchedZeroAmounts: incoming.filter(
      (m, i) => !candidates[i].length && m.amount === 0,
    ).length,
    missing,
    different,
  };
}

let browser;
const baseline = new Map(),
  runs = [];
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    channel:
      process.env.TEST_BROWSER_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
  });
  for (let pair = 0; pair < files.length / 2; pair++) {
    for (const reverse of [false, true]) {
      const first = pair * 2 + Number(reverse),
        second = pair * 2 + Number(!reverse);
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
        await page.goto(`${origin}/Tanukoin/#/cuentas`);
        await page
          .getByRole("button", { name: "Crear mi primera cuenta" })
          .click();
        await page
          .getByLabel("Nombre", { exact: true })
          .fill("Comprobación aislada");
        await page.getByRole("button", { name: "Guardar cuenta" }).click();
        await page.goto(`${origin}/Tanukoin/#/movimientos`);
        stage = "primer archivo";
        const initial = await review(page, files[first]);
        await save(page, initial.selected);
        const before = await stored(page);
        if (before.length !== initial.selected) throw new Error("Recuento");
        baseline.set(first, before);
        stage = "segundo archivo";
        const result = await review(page, files[second]);
        await save(page, result.selected);
        const after = await stored(page);
        if (after.length !== before.length + result.selected || external)
          throw new Error("Validación");
        const modified = before.filter((old) => {
          const current = after.find((m) => m.id === old.id);
          return (
            !current || fields.some((field) => current[field] !== old[field])
          );
        }).length;
        runs.push({
          pair: pair + 1,
          direction: reverse ? "B → A" : "A → B",
          first,
          second,
          initial: before.length,
          ...result,
          final: after.length,
          existingEnrichedOrChanged: modified,
          externalRequests: external,
        });
        console.log(JSON.stringify(runs.at(-1)));
      } catch {
        process.exitCode = 1;
        console.error(
          `Par ${pair + 1}, ${reverse ? "B → A" : "A → B"}: fallo en ${stage}; sin registrar datos privados.`,
        );
      } finally {
        await context.close();
      }
    }
  }
  for (const run of runs) {
    if (!baseline.has(run.first) || !baseline.has(run.second)) continue;
    console.log(
      JSON.stringify({
        pair: run.pair,
        direction: run.direction,
        diagnostic: compare(baseline.get(run.first), baseline.get(run.second)),
      }),
    );
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
