import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

for (const mode of ["absent", "null", "blocked", "no-f16"])
  test(`WebGPU ${mode}: avisa y bloquea los modelos sin alternativa CPU`, async ({
    page,
  }) => {
    const downloads: string[] = [];
    page.on("request", (request) => {
      if (/huggingface|githubusercontent/.test(request.url()))
        downloads.push(request.url());
    });
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, "gpu", {
        configurable: true,
        value:
          mode === "absent"
            ? undefined
            : {
                requestAdapter: async () => {
                  if (mode === "blocked")
                    throw new Error("Bloqueado por el navegador");
                  if (mode === "null") return null;
                  return {
                    features: new Set(),
                    limits: {
                      maxBufferSize: 1e9,
                      maxStorageBufferBindingSize: 1e9,
                    },
                  };
                },
              },
      });
    }, mode);
    await page.goto("/Tanukoin/#/ia");
    const models = page.getByLabel("Modelos de Tanu");
    await expect(models.getByRole("alert")).toContainText(
      "Tanu no puede funcionar",
    );
    await expect(models.getByRole("alert")).toContainText(
      mode === "no-f16"
        ? "shader-f16"
        : "WebGPU no está disponible o está bloqueado",
    );
    const buttons = models.getByRole("button", { name: "Descargar modelo" });
    await expect(buttons).toHaveCount(3);
    for (const button of await buttons.all())
      await expect(button).toBeDisabled();
    await expect(models.getByRole("tab")).toHaveCount(0);
    await expect(models.getByLabel("Hilos de CPU")).toHaveCount(0);
    expect(downloads).toEqual([]);
  });

test("servidor estático: aislamiento explícito y reinicio offline sin perder datos", async ({
  page,
  context,
}) => {
  let navigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      navigations++;
  });
  const response = await page.goto("/Tanukoin/#/ia");
  expect(response?.headers()["cross-origin-opener-policy"]).toBeUndefined();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  expect(navigations).toBe(1);
  await page.reload();
  await expect.poll(() => page.evaluate(() => crossOriginIsolated)).toBe(true);
  expect(navigations).toBe(2);
  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  const state = await page.evaluate(async () => {
    const worker = new Worker(
      URL.createObjectURL(
        new Blob(
          [
            "postMessage({isolated:crossOriginIsolated,shared:typeof SharedArrayBuffer !== 'undefined'})",
          ],
          { type: "text/javascript" },
        ),
      ),
    );
    const result = await new Promise(
      (resolve) => (worker.onmessage = (e) => resolve(e.data)),
    );
    worker.terminate();
    return result;
  });
  expect(state).toEqual({ isolated: true, shared: true });
  await expect(
    page.getByRole("button", { name: "Habilitar multihilo y recargar" }),
  ).toHaveCount(0);
});

test("retorno bancario desde otra ventana tras navegar fuera, sin opener ni códigos persistidos", async ({
  page,
  context,
}) => {
  await page.goto("/Tanukoin/");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  await page.evaluate(() => {
    const channel = new BroadcastChannel("tanukoin-bank-auth:ficticio");
    (window as any).bankResult = null;
    channel.onmessage = (event) => {
      (window as any).bankResult = event.data;
      channel.close();
    };
  });
  await context.route("https://bank.example.test/**", (route) =>
    route.fulfill({ body: "Banco ficticio", contentType: "text/html" }),
  );
  const callback = await context.newPage();
  await callback.goto("https://bank.example.test/authorize");
  await callback.goto(
    "http://127.0.0.1:4173/Tanukoin/bank-callback.html?state=ficticio&code=codigo-ficticio",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).bankResult?.code))
    .toBe("codigo-ficticio");
  expect(await callback.evaluate(() => window.opener)).toBeNull();
  expect(callback.url()).not.toContain("codigo-ficticio");
  expect(
    await callback.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  expect(await callback.evaluate(() => crossOriginIsolated)).toBe(true);
});

test("solo GPU y 9B experimental sin activación ni descargas", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (/huggingface|githubusercontent/.test(request.url()))
      external.push(request.url());
  });
  await page.goto("/Tanukoin/#/ia");
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByLabel("Hilos de CPU")).toHaveCount(0);
  await expect(page.locator(".chat-models .model-card")).toHaveCount(3);
  const experimental = page.getByLabel("Modelo Qwen3.5 9B", {
    exact: true,
  });
  await expect(experimental.locator(".experimental-badge")).toHaveText(
    "Experimental",
  );
  await expect(experimental).not.toContainText(
    "Pendiente de pruebas reales en equipos de 12 GB de VRAM",
  );
  expect(external).toEqual([]);
});

test("mapas, búsqueda pública, puente de extensión y descarga bajo aislamiento", async ({
  page,
  context,
}) => {
  const cors = { "access-control-allow-origin": "*" };
  await context.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      headers: cors,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await context.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      headers: cors,
      json: {
        features: [
          {
            properties: { name: "Comercio ficticio", city: "Madrid" },
            geometry: { coordinates: [-3.7, 40.4] },
          },
        ],
      },
    }),
  );
  await context.route("https://es.wikipedia.org/**", (route) =>
    route.fulfill({ headers: cors, json: { query: { search: [] } } }),
  );
  await page.goto("/Tanukoin/#/ajustes");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await page.getByRole("switch", { name: /Callejero/ }).click();
  await expect(page.getByRole("switch", { name: /Callejero/ })).toBeChecked();
  await page.getByRole("switch", { name: /Consultar comercios/ }).click();
  await expect(
    page.getByRole("switch", { name: /Consultar comercios/ }),
  ).toBeChecked();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia completa" }).click();
  expect((await download).suggestedFilename()).toMatch(/^tanukoin-.*\.json$/);
  await page.evaluate(async () => {
    const request = indexedDB.open("tanukoin");
    const database = await new Promise<IDBDatabase>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    );
    const tx = database.transaction(["accounts", "movements"], "readwrite");
    tx.objectStore("accounts").put({
      id: "a",
      name: "Ficticia",
      bank: "",
      currency: "EUR",
    });
    tx.objectStore("movements").put({
      id: "m",
      accountId: "a",
      date: "2026-09-20",
      amount: -1250,
      currency: "EUR",
      description: "Compra ficticia",
      merchant: "Comercio ficticio",
      notes: "",
      source: "prueba",
      fingerprint: "ficticio",
      createdAt: "2026-09-20",
      categorySource: "none",
    });
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    database.close();
  });
  await page.goto("/Tanukoin/#/mapa?id=m");
  await page.reload();
  await expect
    .poll(() => page.locator(".leaflet-tile-loaded").count())
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Buscar un comercio en internet" })
    .click();
  await page
    .getByRole("button", { name: "Consultar fuentes gratuitas" })
    .click();
  await expect(page.locator(".search-result")).toContainText(
    "Comercio ficticio",
  );
  await page.evaluate(() => {
    (window as any).chrome = {
      runtime: {
        sendMessage: async (request: unknown) => ({ result: request }),
      },
    };
  });
  await context.route("**/fixture-extension-bridge.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: readFileSync("extension/bridge.js", "utf8"),
    }),
  );
  await page.addScriptTag({ url: "/Tanukoin/fixture-extension-bridge.js" });
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.addEventListener("message", function listener(event) {
          if (event.data?.channel !== "tanukoin-bank-response") return;
          window.removeEventListener("message", listener);
          resolve(event.data.result);
        });
        window.postMessage(
          { channel: "tanukoin-bank-request", id: "ficticio", action: "ping" },
          location.origin,
        );
      }),
  );
  expect(result).toMatchObject({ action: "ping" });
});
