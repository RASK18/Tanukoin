import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

async function createAccount(page: Page) {
  await page.goto("#/cuentas");
  await page.getByRole("button", { name: "Crear mi primera cuenta" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Principal");
  await page.getByRole("button", { name: "Guardar cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Principal" })).toBeVisible();
}
async function importFile(page: Page, name: string, buffer: Buffer) {
  await page.goto("#/movimientos");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .getByLabel("Archivo bancario")
    .setInputFiles({ name, mimeType: "application/octet-stream", buffer });
  await expect(
    page.getByRole("button", { name: "Revisar movimientos" }),
  ).toBeVisible();
}
const csv = Buffer.from(
  "Fecha;Concepto;Importe;Saldo\n15/09/2026;Compra supermercado;-54,32;100,00\n16/09/2026;Nomina;2540,00;2640,00\n17/09/2026;Cafe;-2,50;2637,50\n",
);

test("Tus movimientos muestra el saldo importado, incluido cero, sin recalcular al filtrar", async ({
  page,
}) => {
  await createAccount(page);
  await importFile(
    page,
    "saldos.csv",
    Buffer.from(
      "Fecha;Concepto;Importe;Saldo\n15/09/2026;Saldo positivo;-10,00;123,45\n16/09/2026;Saldo cero;-123,45;0,00\n17/09/2026;Saldo negativo;-8,00;-8,00\n18/09/2026;Sin saldo;-2,00;\n",
    ),
  );
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await page.getByRole("button", { name: "Importar 4 movimientos" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Saldo", exact: true }),
  ).toBeVisible();
  for (const [description, balance] of [
    ["Saldo positivo", "123,45 €"],
    ["Saldo cero", "0,00 €"],
    ["Saldo negativo", "-8,00 €"],
    ["Sin saldo", "—"],
  ]) {
    const row = page
      .getByRole("row")
      .filter({ has: page.getByText(description, { exact: true }) });
    await expect(row.getByRole("cell").nth(6)).toHaveText(balance);
  }
  await page.getByLabel("Ordenar movimientos").selectOption("date-asc");
  await page.getByLabel("Filtrar movimientos").fill("Saldo positivo");
  await expect(
    page.getByRole("cell", { name: "123,45 €", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "123,45 €", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/movements-balance.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const fail of [false, true])
  test(`importación grande: progreso y ${fail ? "rollback con reintento" : "guardado completo"}`, async ({
    page,
  }) => {
    await createAccount(page);
    await importFile(
      page,
      "muchos.csv",
      Buffer.from(
        "Fecha;Concepto;Importe;Saldo\n" +
          Array.from(
            { length: 1200 },
            (_, i) =>
              `15/09/2026;Movimiento ficticio ${i};-1,00;${2000 - i},00\n`,
          ).join(""),
      ),
    );
    await page.getByRole("button", { name: "Revisar movimientos" }).click();
    await page.evaluate((fail) => {
      const seen: string[] = [];
      (window as any).importStatuses = seen;
      new MutationObserver(() => {
        const status = document.querySelector(".import-progress")?.textContent;
        if (status) seen.push(status);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      if (fail) {
        const original = IDBObjectStore.prototype.add;
        let added = 0;
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === "movements" && ++added === 251) {
            IDBObjectStore.prototype.add = original;
            throw new DOMException(
              "Fallo de prueba al guardar",
              "QuotaExceededError",
            );
          }
          return original.apply(this, args);
        };
      }
    }, fail);
    await page
      .getByRole("button", { name: "Importar 1200 movimientos" })
      .click();
    const countSaved = () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open("tanukoin");
            request.onsuccess = () => {
              const database = request.result;
              const count = database
                .transaction("movements")
                .objectStore("movements")
                .count();
              count.onsuccess = () => {
                database.close();
                resolve(count.result);
              };
              count.onerror = () => reject(count.error);
            };
            request.onerror = () => reject(request.error);
          }),
      );
    if (fail) {
      await expect(
        page.getByRole("button", { name: "Importar 1200 movimientos" }),
      ).toBeVisible();
      expect(await countSaved()).toBe(0);
      await expect(
        page.getByLabel("Incluir fila 2", { exact: true }),
      ).toBeChecked();
      await page
        .getByRole("button", { name: "Importar 1200 movimientos" })
        .click();
    }
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(await countSaved()).toBe(1200);
    const statuses = await page.evaluate(
      () => (window as any).importStatuses as string[],
    );
    expect(statuses.some((s) => s.includes("Importando tus movimientos"))).toBe(
      true,
    );
    expect(statuses.some((s) => /Quedan [1-9]\d* en esta fase/.test(s))).toBe(
      true,
    );
    expect(statuses.some((s) => s.includes("Guardando movimientos"))).toBe(
      true,
    );
  });

test("cuenta, importación CSV, edición, exportación y reimportación con duplicados", async ({
  page,
}) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173/") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      outside.push(r.url());
  });
  await createAccount(page);
  await importFile(page, "extracto.csv", csv);
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await page.getByRole("button", { name: "Importar 3 movimientos" }).click();
  await expect(
    page.getByText("Compra supermercado", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Compra supermercado" })
    .click();
  await page
    .getByRole("combobox", { name: "Categoría", exact: true })
    .fill("Alimentación");
  await page.getByRole("option", { name: "Alimentación", exact: true }).click();
  await page.getByLabel("Notas", { exact: true }).fill("Compra semanal");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Compra semanal", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "tanukoin-movimientos.csv",
  );
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page
    .getByLabel("Archivo bancario")
    .setInputFiles({ name: "extracto.csv", mimeType: "text/csv", buffer: csv });
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await expect(
    page.getByRole("button", { name: "Importar 0 movimientos" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Posible duplicado", { exact: true }),
  ).toHaveCount(3);
  expect(outside).toEqual([]);
});
for (const bookType of ["xlsx", "xls"] as const)
  test(`PWA: nuevo arranque offline y lector ${bookType} sin visitar antes el importador`, async ({
    page,
    context,
  }) => {
    await createAccount(page);
    await page.goto("/Tanukoin/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
        timeout: 60000,
      })
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Tu dinero, con perspectiva" }),
    ).toBeVisible();
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Fecha", "Concepto", "Importe"],
        ["18/09/2026", "Compra Excel", "-22,10"],
      ]),
      "Cuenta",
    );
    await importFile(
      page,
      `extracto.${bookType}`,
      XLSX.write(book, { type: "buffer", bookType }),
    );
    await page.getByRole("button", { name: "Revisar movimientos" }).click();
    await page.getByRole("button", { name: "Importar 1 movimientos" }).click();
    await expect(page.getByText("Compra Excel", { exact: true })).toBeVisible();
  });
function textPdf(
  contents = [
    "BT /F1 12 Tf 40 760 Td (Fecha) Tj 130 0 Td (Concepto) Tj 200 0 Td (Importe) Tj -330 -24 Td (19/09/2026) Tj 130 0 Td (Compra PDF) Tj 200 0 Td (-12,30) Tj ET",
  ],
) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${contents.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${contents.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...contents.flatMap((content, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ]),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test("PDF con texto se procesa localmente y se puede revisar", async ({
  page,
}) => {
  await createAccount(page);
  await importFile(page, "extracto.pdf", textPdf());
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await expect(
    page.getByRole("button", { name: "Importar 1 movimientos" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Importar 1 movimientos" }).click();
  await expect(page.getByText("Compra PDF", { exact: true })).toBeVisible();
});

test("certificado PDF une conceptos y selecciona todas las páginas sin repetir cabeceras", async ({
  page,
}) => {
  const cell = (x: number, y: number, value: string) =>
    `BT /F1 7 Tf ${x} ${y} Td (${value}) Tj ET`;
  const first = [
    cell(230, 700, "Titular ficticio"),
    cell(89, 570, "FE.ANOTAC"),
    cell(139, 570, "IMPORTE"),
    cell(190, 570, "SALDO"),
    cell(347, 570, "CONCEPTO"),
    cell(230, 558, "COMPRA EN"),
    cell(89, 547, "19/09/2026"),
    cell(145, 547, "-12,30"),
    cell(190, 547, "987,70"),
    cell(350, 547, "TIENDA FICTICIA"),
  ].join("\n");
  const second = [
    cell(230, 780, "ABONO POR"),
    cell(89, 769, "18/09/2026"),
    cell(145, 769, "20,00"),
    cell(190, 769, "1000,00"),
    cell(350, 769, "DEVOLUCION"),
    cell(230, 730, "Firma del certificado"),
  ].join("\n");
  await createAccount(page);
  await importFile(page, "certificado-ficticio.pdf", textPdf([first, second]));
  await expect(
    page.getByText(/Extracto reconocido: 2 páginas seleccionadas/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await page.getByRole("button", { name: "Importar 2 movimientos" }).click();
  await expect(
    page.getByText("COMPRA EN TIENDA FICTICIA", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ABONO POR DEVOLUCION", { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("-12,30");
  expect(csv).toContain("20,00");
  expect(csv).toContain("987,70");
  expect(csv).not.toContain("Firma del certificado");
});

test("arrastrar archivo detecta columnas y conserva operaciones iguales con distinto saldo", async ({
  page,
}) => {
  await createAccount(page);
  await page.goto("#/movimientos");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const content =
    "Saldo;Detalle;Fecha;Cargo\n100,00;Redondeo;20/09/2026;4,90\n95,10;Redondeo;20/09/2026;4,90";
  const transfer = await page.evaluateHandle((content) => {
    const dt = new DataTransfer();
    dt.items.add(new File([content], "ficticio.csv", { type: "text/csv" }));
    return dt;
  }, content);
  await page
    .locator(".dropzone")
    .dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".dropzone")).toHaveClass(/dragging/);
  await page
    .locator(".dropzone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    page.getByRole("button", { name: "Revisar movimientos" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Formato de fecha")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Vista previa", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/import-simple.png" });
  await page.getByText("Opciones avanzadas", { exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Saldo", exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("combobox", { name: "Cargo (alternativa)", exact: true }),
  ).toHaveValue("3");
  await page.getByText("Opciones avanzadas", { exact: true }).click();
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await expect(
    page.getByText("Posible duplicado", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Importar 2 movimientos" }).click();
  await importFile(page, "ficticio.csv", Buffer.from(content));
  await page.getByRole("button", { name: "Revisar movimientos" }).click();
  await expect(
    page.getByRole("button", { name: "Importar 0 movimientos" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Posible duplicado", { exact: true }),
  ).toHaveCount(2);
});
test("historial de ubicaciones y copias requieren confirmación", async ({
  page,
}) => {
  await createAccount(page);
  await page.goto("#/mapa");
  await page.locator("input[type=file]").setInputFiles({
    name: "Records.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        locations: [
          {
            latitudeE7: 404168000,
            longitudeE7: -37038000,
            timestamp: "2026-09-15T12:00:00Z",
          },
        ],
      }),
    ),
  });
  await expect(page.getByText(/1 ubicaciones nuevas/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByText("1 puntos y estancias guardados")).toBeVisible();
  await page.goto("#/ajustes");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar copia completa" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^tanukoin-/);
  await page
    .locator("input[type=file]")
    .setInputFiles((await download.path())!);
  await expect(page.getByRole("dialog")).toContainText("1 cuentas");
  await expect(
    page.getByRole("button", { name: "Sustituir datos y restaurar" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sustituir datos y restaurar" })
    .click();
  await expect(page.getByRole("status")).toContainText("Copia restaurada");
  await page.goto("#/cuentas");
  await expect(page.getByRole("heading", { name: "Principal" })).toBeVisible();
  await page.goto("#/mapa");
  await expect(page.getByText("1 puntos y estancias guardados")).toBeVisible();
});
test("móvil: navegación, Tanu y ausencia de desbordamiento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/Tanukoin/");
  await expect(
    page.getByRole("heading", { name: "Tu dinero, con perspectiva" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Abrir menú" }).click();
  await page.getByRole("link", { name: "Categorías", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cada cosa en su lugar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hablar con Tanu" }).click();
  await expect(
    page
      .getByLabel("Chat de Tanu", { exact: true })
      .getByRole("link", { name: "IA local", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Pregunta a Tanu")).toHaveCount(0);
  await expect(page.getByLabel("Chat de Tanu", { exact: true })).toContainText(
    "Para hablar conmigo, descarga un modelo",
  );
  await page.screenshot({
    path: "artifacts/tanukoin-mobile.png",
    fullPage: true,
  });
});
test("diseño de escritorio sin errores de ejecución", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/Tanukoin/");
  await expect(
    page.getByRole("heading", { name: "Tu dinero, con perspectiva" }),
  ).toBeVisible();
  for (const [route, title] of [
    ["cuentas", "Tus cuentas"],
    ["reglas", "Menos trabajo, más orden"],
    ["suscripciones", "Nada te pilla por sorpresa"],
    ["ia", "IA local, de verdad"],
    ["banco", "Tu banco, conectado contigo"],
  ]) {
    await page.goto(`#/` + route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/Tanukoin/");
  await page.screenshot({
    path: "artifacts/tanukoin-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
