import { test, expect } from "@playwright/test";
import { CHAT_MODELS, RETIRED_CPU_MODELS } from "../../src/features/ai/models";

test("catálogo compacto con WebGPU y recomendación fija, también en móvil", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({
          features: new Set(["shader-f16"]),
          limits: { maxBufferSize: 1e9, maxStorageBufferBindingSize: 1e9 },
        }),
      },
    });
  });
  await page.goto("/Tanukoin/#/ia");
  const models = page.getByLabel("Modelos de Tanu");
  const recommended = page.getByLabel("Modelo Qwen3.5 4B", { exact: true });
  await expect(models.getByRole("status")).toHaveText("WebGPU disponible");
  await expect(
    recommended.getByText("Recomendado", { exact: true }),
  ).toBeVisible();
  await expect(
    recommended.getByRole("button", { name: "Descargar modelo" }),
  ).toBeEnabled();
  await expect(models).not.toContainText("Perfil detectado del dispositivo");
  await expect(models).not.toContainText("¿Qué modelo me conviene?");
  await expect(models).not.toContainText("Compatible con este navegador");
  await expect(models).not.toContainText("generación con la tarjeta gráfica");

  // Solo simula la instalación para revisar el diseño; no carga modelos.
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
        savedAt: "2026-09-23",
        checkedDevice: "GPU anterior ficticia",
      };
      tx.objectStore("models").put(state);
      tx.objectStore("models").put({ ...state, id: "chat" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, CHAT_MODELS[1]);
  await page.reload();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const offline = recommended.getByRole("button", {
      name: "Comprobar offline",
    });
    const uninstall = recommended.getByRole("button", { name: "Desinstalar" });
    await expect(offline).toBeVisible();
    const a = (await offline.boundingBox())!;
    const b = (await uninstall.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    const heading = (await recommended.getByRole("heading").boundingBox())!;
    const icon = (await recommended.locator(".feature-icon").boundingBox())!;
    expect(
      Math.abs(heading.y + heading.height / 2 - icon.y - icon.height / 2),
    ).toBeLessThan(1);
    const badge = (await recommended
      .locator(".recommended-badge")
      .boundingBox())!;
    const card = (await recommended.boundingBox())!;
    expect(badge.y).toBeLessThan(card.y);
    for (const button of [offline, uninstall]) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      expect(
        await button.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ai-catalog-${width}.png`,
      fullPage: true,
    });
  }
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });
  });
  await page.reload();
  await expect(models.locator(".webgpu-indicator")).toHaveText(
    "WebGPU no compatible",
  );
  await expect(models.locator(".webgpu-indicator")).toHaveClass(/unavailable/);
  await expect(recommended.locator(".recommended-badge")).toHaveText(
    "Recomendado",
  );
  await expect(recommended.getByRole("heading")).toContainText("En uso");
  await expect(
    recommended.getByRole("button", { name: "Comprobar offline" }),
  ).toBeDisabled();
  await expect(
    recommended.getByRole("button", { name: "Desinstalar" }),
  ).toBeEnabled();
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
  for (const model of CHAT_MODELS)
    await expect(
      page.getByLabel(`Modelo ${model.name}`, { exact: true }),
    ).toBeVisible();
  await expect(page.getByLabel("Modelos de Tanu")).toContainText("Recomendado");
  expect(requests).toEqual([]);
});

test("las opciones de modelos caben en móvil y conservan acceso por teclado", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({
          features: new Set(["shader-f16"]),
          limits: { maxBufferSize: 1e9, maxStorageBufferBindingSize: 1e9 },
        }),
      },
    });
  });
  await page.goto("/Tanukoin/#/ia");
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
  await page.reload();
  const light = page.getByLabel("Modelo Qwen3.5 2B", {
    exact: true,
  });
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

test("retira CPU 0.8B instalado y mantiene GPU 4B preparado como opción independiente", async ({
  page,
}) => {
  await page.goto("/Tanukoin/#/ia");
  await page.getByLabel("Modelo Qwen3.5 2B", { exact: true }).waitFor();
  await page.evaluate(
    async ({ cpu, gpu }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("tanukoin");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = database.transaction("models", "readwrite");
      for (const model of [cpu, gpu]) {
        const state = {
          id: model.key,
          modelKey: model.key,
          revision: model.revision,
          ready: true,
          savedAt: "2026-09-22",
        };
        tx.objectStore("models").put(state);
        if (model.key === cpu.key)
          tx.objectStore("models").put({ ...state, id: "chat" });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { cpu: RETIRED_CPU_MODELS[2], gpu: CHAT_MODELS[1] },
  );
  await page.reload();
  const retired = page.getByLabel("Modelos retirados");
  await expect(retired).toContainText("Qwen3.5 0.8B · CPU");
  await expect(retired).toContainText("Desinstálalos e instala uno");
  await expect(retired.getByRole("button")).toHaveCount(1);
  await expect(
    retired.getByRole("button", { name: "Desinstalar" }),
  ).toBeEnabled();
  const gpu = page.getByLabel("Modelo Qwen3.5 4B", { exact: true });
  await expect(gpu).toContainText("Listo");
  await expect(gpu.getByRole("button", { name: "Usar modelo" })).toBeVisible();
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  await expect(page.getByLabel("Pregunta a Tanu")).toHaveCount(0);
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
  await page.getByLabel("Modelo Qwen3.5 2B", { exact: true }).waitFor();
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
  await expect(
    page.getByLabel("Modelo Qwen3.5 2B", { exact: true }),
  ).toContainText("Sin preparar");
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
