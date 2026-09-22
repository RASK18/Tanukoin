import { test, expect } from "@playwright/test";
import { CHAT_MODELS } from "../../src/features/ai/models";

test("perfil del dispositivo: ignora la cuota artificial y se adapta a móvil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      hardwareConcurrency: { configurable: true, value: 6 },
      deviceMemory: { configurable: true, value: 16 },
      userAgentData: { configurable: true, value: { mobile: false } },
      gpu: {
        configurable: true,
        value: {
          requestAdapter: async () => ({
            info: { vendor: "GPU ficticia" },
            features: new Set(["shader-f16"]),
            limits: { maxBufferSize: 1e9, maxStorageBufferBindingSize: 1e9 },
          }),
        },
      },
    });
    navigator.storage.estimate = async () => ({ quota: 2147483648, usage: 0 });
  });
  await page.goto("/Tanukoin/#/ia");
  const profile = page.getByRole("region", {
    name: "Perfil detectado del dispositivo",
  });
  await expect(profile.locator("dd")).toHaveText([
    "6",
    "16 GB",
    "Disponible",
    "Escritorio",
  ]);
  const models = page.getByLabel("Modelos de Tanu");
  await expect(models).toContainText("Recomendado: Equilibrado");
  await expect(models).not.toContainText("Libera espacio");
  await expect(models).not.toContainText("Espacio disponible estimado");
  await expect(
    page
      .getByLabel("Modelo Equilibrado", { exact: true })
      .getByRole("button", { name: "Descargar modelo" }),
  ).toBeEnabled();
  await profile.screenshot({
    path: "test-results/device-profile-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  // A narrow desktop window should not be classified as mobile hardware.
  await expect(profile).toContainText("Escritorio");
  await profile.screenshot({
    path: "test-results/device-profile-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      userAgentData: { configurable: true, value: { mobile: true } },
      deviceMemory: { configurable: true, value: undefined },
      hardwareConcurrency: { configurable: true, value: 0 },
      gpu: { configurable: true, value: undefined },
    });
  });
  await page.reload();
  await expect(profile.locator("dd")).toHaveText([
    "No disponible",
    "No disponible",
    "No disponible",
    "Móvil / tableta",
  ]);
  await expect(models).toContainText("Recomendado: Ligero");
});

test("sin modelo solo ofrece la guía breve y enlace accesible, sin descargas", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (/huggingface|raw.githubusercontent|mlc-ai/.test(r.url()))
      requests.push(r.url());
  });
  await page.goto("/Tanukoin/");
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  const chat = page.getByLabel("Chat de Tanu", { exact: true });
  await expect(chat).toContainText("Sin preparar");
  await expect(chat).toContainText(
    "Para hablar conmigo, descarga un modelo en IA local",
  );
  await expect(page.getByLabel("Pregunta a Tanu")).toHaveCount(0);
  await expect(chat.locator(".chat-suggestions")).toHaveCount(0);
  const link = chat.getByRole("link", { name: "IA local", exact: true });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ia$/);
  for (const name of CHAT_MODELS.map((model) => model.name))
    await expect(
      page.getByLabel(`Modelo ${name}`, { exact: true }),
    ).toBeVisible();
  await expect(page.getByLabel("Modelos de Tanu")).toContainText(
    "Recomendado:",
  );
  expect(requests).toEqual([]);
});

test("las opciones de modelos caben en móvil y conservan acceso por teclado", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/Tanukoin/#/ia");
  const light = page.getByLabel("Modelo Ligero", { exact: true });
  const download = light.getByRole("button", { name: "Descargar modelo" });
  await expect(download).toBeEnabled();
  await download.focus();
  await expect(download).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const model of CHAT_MODELS) {
    const card = page.getByLabel(`Modelo ${model.name}`, { exact: true });
    await expect(card).toContainText("Sin preparar");
    const bounds = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({
    path: info.outputPath("modelos-movil.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: info.outputPath("modelos-escritorio.png"),
    fullPage: true,
  });
});

test("una variante vigente preparada habilita el chat al arrancar", async ({
  page,
}) => {
  await page.goto("/Tanukoin/");
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  await expect(page.getByLabel("Pregunta a Tanu")).toHaveCount(0);
  // UI state transition only; real loading/generation is covered by local-chat.spec.
  await page.evaluate(async (model) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("tanukoin");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("models", "readwrite");
      const state = {
        id: model.key,
        modelKey: model.key,
        revision: model.revision,
        ready: true,
        savedAt: "2026-09-21",
      };
      tx.objectStore("models").put(state);
      tx.objectStore("models").put({ ...state, id: "chat" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, CHAT_MODELS[0]);
  // Raw IndexedDB writes do not emit Dexie's cross-context notification.
  await page.reload();
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  await expect(page.getByLabel("Pregunta a Tanu")).toBeEnabled();
  await expect(page.getByLabel("Chat de Tanu", { exact: true })).toContainText(
    "Listo",
  );
});

test("retira Qwen GPU 1.7B sin borrar su caché ni habilitar el chat", async ({
  page,
}) => {
  await page.goto("/Tanukoin/#/ia");
  await page.getByLabel("Modelo Ligero", { exact: true }).waitFor();
  await page.evaluate(async () => {
    const cache = await caches.open("retirement-fixture");
    await cache.put(
      "https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/resolve/main/part.bin",
      new Response("datos ficticios"),
    );
    await cache.put(
      "https://example.test/another-model",
      new Response("conservar"),
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("tanukoin");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("models", "readwrite");
      tx.objectStore("models").put({
        id: "chat",
        ready: true,
        revision: "tanukoin-models-1",
        savedAt: "2026-09-21",
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  const retired = page.getByLabel("Modelos retirados");
  await expect(retired).toContainText("Qwen3 1.7B GPU");
  await expect(
    retired.getByRole("button", { name: "Desinstalar" }),
  ).toBeVisible();
  await expect(
    retired.getByRole("button", { name: "Usar modelo" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Modelo Ligero", { exact: true })).toContainText(
    "Sin preparar",
  );
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  await expect(page.getByLabel("Pregunta a Tanu")).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        !!(await (
          await caches.open("retirement-fixture")
        ).match(
          "https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/resolve/main/part.bin",
        )),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Cerrar chat de Tanu" }).click();
  await retired.getByRole("button", { name: "Desinstalar" }).click();
  await expect(retired).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const cache = await caches.open("retirement-fixture");
      return {
        old: !!(await cache.match(
          "https://huggingface.co/mlc-ai/Qwen3-1.7B-q4f16_1-MLC/resolve/main/part.bin",
        )),
        other: !!(await cache.match("https://example.test/another-model")),
      };
    }),
  ).toEqual({ old: false, other: true });
});
