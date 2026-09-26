import { expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readTabular } from "../src/features/import/tabular";
import {
  readPdfPage,
  pdfDate,
  type PdfContext,
} from "../src/features/import/pdf-reader";
import { prepareImport } from "../src/features/import/prepare";
import { parsePageRanges } from "../src/features/import/page-ranges";
import type { PdfText } from "../src/features/import/pdf-table";
import type { Sheet } from "../src/features/import/types";
import { validateDetectedLayout } from "../src/features/import/detect";

const account = {
  id: "a",
  name: "Cuenta de prueba",
  bank: "",
  currency: "EUR",
};
const encode = (text: string) => new TextEncoder().encode(text).buffer;
const csv = (text: string) =>
  prepareImport(readTabular(encode(text), "ficticio.csv"), account, [0]);
const text = (x: number, y: number, text: string, width = 30): PdfText => ({
  x,
  y,
  text,
  width,
});
const prepared = (sheets: Sheet[], indices = sheets.map((_, i) => i)) =>
  prepareImport(
    { name: "ficticio.pdf", kind: "pdf", sheets, warnings: [] },
    account,
    indices,
  );

it.each([false, true])(
  "respeta fechas numéricas de Excel con calendario 1904=%s y días ambiguos",
  (date1904) => {
    const book = XLSX.utils.book_new();
    const serial = date1904 ? 44807 : 46269; // 4 de septiembre de 2026, en ambos calendarios.
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Fecha", "Concepto", "Importe"],
      [serial, "Fecha nativa", 1.25],
    ]);
    sheet.A2.z = "m/d/yy";
    book.Workbook = { WBProps: { date1904 } };
    XLSX.utils.book_append_sheet(book, sheet, "Datos");
    const result = prepareImport(
      readTabular(
        XLSX.write(book, { type: "array", bookType: "xlsx" }),
        "ficticio.xlsx",
      ),
      account,
      [0],
    );
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].movement.date).toBe("2026-09-04");
  },
);

it("la ayuda de IA conserva la moneda reconocida aunque no proponga esa columna", () => {
  const rows = [
    ["Día", "Detalle libre", "Total anotado", "Divisa"],
    ["20/09/2026", "Compra ficticia", "-2,50", "USD"],
  ];
  const layout = validateDetectedLayout(
    {
      headerRow: 0,
      dateFormat: "DMY",
      decimal: ",",
      columns: { date: 0, description: 1, amount: 2 },
    },
    rows,
  );
  expect(layout?.columns.currency).toBe(3);
  const result = prepareImport(
    { name: "ficticio.csv", sheets: [{ name: "Datos", rows }], warnings: [] },
    account,
    [0],
    { 0: layout! },
  );
  expect(result.errors[0]).toContain("no coincide");
});

it("lee HTML con extensión XLS y texto Windows-1252, sin ejecutar etiquetas", () => {
  const html =
    '\n\t<!doctype html><html><script>throw Error("NO EJECUTAR")</script><table><tr><td>Resumen</td></tr><tr><th>Fecha Operación</th><th>Fecha Valor</th><th>Concepto</th><th>Importe</th><th>Saldo</th></tr><tr><td>20/09/2026</td><td>21/09/2026</td><td>Café ficticio</td><td>-2,50</td><td>97,50</td></tr></table></html>';
  const bytes = Uint8Array.from([...html].map((c) => c.charCodeAt(0)));
  const result = prepareImport(
    readTabular(bytes.buffer, "ficticio.xls"),
    account,
    [0],
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    date: "2026-09-20",
    description: "Café ficticio",
    amount: -250,
    balance: 9750,
    secondaryDate: "2026-09-21",
    notes: "",
  });
});

it("detecta la cabecera desplazada de Excel y no inventa un saldo", () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      [],
      ["", "Cuenta ficticia"],
      ["", "#", "FECHA", "FECHA VALOR", "DESCRIPCION", "IMPORTE", "TIPO"],
      ["", 1, "20/09/2026", "21/09/2026", "Abono de prueba", "1,25", "Abono"],
    ]),
    "Datos",
  );
  const result = prepareImport(
    readTabular(
      XLSX.write(book, { type: "array", bookType: "xlsx" }),
      "ficticio.xlsx",
    ),
    account,
    [0],
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    amount: 125,
    balance: undefined,
    date: "2026-09-20",
  });
});

it("conserva la apertura sin concepto, ceros y decimales de ambos CSV MyInvestor", () => {
  const result = csv(
    "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa\n20/09/2026;20/09/2026;;0;EUR\n21/09/2026;22/09/2026;Compra ficticia;-25;EUR\n22/09/2026;22/09/2026;Abono ficticio;1,35;EUR",
  );
  expect(result.errors).toEqual([]);
  expect(
    result.candidates.map((c) => [c.movement.description, c.movement.amount]),
  ).toEqual([
    ["Sin concepto", 0],
    ["Compra ficticia", -2500],
    ["Abono ficticio", 135],
  ]);
});

const revolutHeader =
  "Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Divisa,State,Saldo";
it("Revolut Pago con tarjeta extrae la contraparte sin inventar divisa original ni cambio ausentes del CSV", () => {
  const result = csv(
    revolutHeader +
      "\nPago con tarjeta,Actual,2026-09-20 12:00:00,2026-09-21 13:00:00,Tienda ficticia,-15.00,0.15,EUR,COMPLETADO,84.85",
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    description: "Tienda ficticia",
    merchant: "Tienda ficticia",
    amount: -1515,
    fee: 15,
    originalAmount: undefined,
    originalCurrency: undefined,
    exchangeRate: undefined,
  });
});
it("Revolut conserva la fecha de inicio y resta la comisión una vez, con desglose", () => {
  const result = csv(
    revolutHeader +
      "\nTarjeta,Actual,2026-09-20 12:34:56,2026-09-22 09:20:00,Compra ficticia,-10.00,0.50,EUR,COMPLETADO,89.50\nIngreso,Actual,2026-09-23 08:00:00,2026-09-23 08:00:00,Abono ficticio,20.00,1.00,EUR,COMPLETED,108.50",
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates.map((c) => c.movement.amount)).toEqual([
    -1050, 1900,
  ]);
  expect(result.candidates[0].movement).toMatchObject({
    date: "2026-09-20",
    time: "12:34:56",
    secondaryTime: "09:20:00",
    secondaryDate: "2026-09-22",
    balance: 8950,
  });
  expect(result.candidates[0].movement.notes).not.toContain("12:34:56");
  expect(result.candidates[0].movement.fee).toBe(50);
  expect(result.candidates[1].movement.fee).toBe(100);
  expect(result.candidates[0].movement.notes).toBe("");
});

it.each([
  [
    "2026-09-20 23:59:59",
    "2026-09-21 00:00:00",
    "2026-09-20",
    "23:59:59",
    "2026-09-21",
    "00:00:00",
  ],
  [
    "2026-09-21 10:00:00",
    "2026-09-20 09:00:00",
    "2026-09-20",
    "09:00:00",
    "2026-09-21",
    "10:00:00",
  ],
  [
    "2026-09-20 18:00:00",
    "2026-09-20 08:00:00",
    "2026-09-20",
    "08:00:00",
    "2026-09-20",
    "18:00:00",
  ],
  [
    "2026-09-20",
    "2026-09-21 09:00:00",
    "2026-09-20",
    undefined,
    "2026-09-21",
    "09:00:00",
  ],
  ["2026-09-20 00:00:00", "", "2026-09-20", "00:00:00", undefined, undefined],
  [
    "2026-09-20 12:34:56",
    "2026-09-20",
    "2026-09-20",
    "12:34:56",
    "2026-09-20",
    undefined,
  ],
])(
  "mantiene ambas horas vinculadas a sus fechas: %s / %s",
  (start, end, date, time, secondaryDate, secondaryTime) => {
    const result = csv(
      `Fecha de inicio;Fecha de finalización;Concepto;Importe\n${start};${end};Compra ficticia;1,00`,
    );
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].movement).toMatchObject({
      date,
      time,
      secondaryDate,
      secondaryTime,
      notes: "",
    });
    expect(result.candidates[0].movement).not.toHaveProperty("timestamp");
  },
);

it.each(["25:00:00", "12:60:00", "12:30:99", "texto"])(
  "no omite silenciosamente una hora inválida %s",
  (time) => {
    const result = csv(
      `Fecha;Hora principal;Concepto;Importe\n2026-09-20;${time};Compra;1`,
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.errors[0]).toContain("Hora");
  },
);

it("las columnas de hora permiten reimportar CSV y rechazan contradicciones", () => {
  const header =
    "Fecha principal;Hora principal;Fecha secundaria;Hora secundaria;Concepto;Importe";
  const good = csv(
    header + "\n2026-09-20;12:34:56;2026-09-21;08:09:10;Compra;1",
  );
  expect(good.errors).toEqual([]);
  expect(good.candidates[0].movement).toMatchObject({
    date: "2026-09-20",
    time: "12:34:56",
    secondaryDate: "2026-09-21",
    secondaryTime: "08:09:10",
  });
  const orphan = csv(header + "\n2026-09-20;12:34:56;;08:09:10;Compra;1");
  expect(orphan.errors[0]).toContain("fecha secundaria");
  const conflict = csv(
    header + "\n2026-09-20 01:00:00;12:34:56;2026-09-21;08:09:10;Compra;1",
  );
  expect(conflict.errors[0]).toContain("no coinciden");
});

it("informa de los estados no completados y bloquea otra moneda", () => {
  const result = csv(
    revolutHeader +
      "\nTarjeta,Actual,2026-09-20 12:34:56,,Compra ficticia,-10.00,0.00,EUR,PENDING,\nTarjeta,Actual,2026-09-20 12:34:56,,Compra ficticia,-10.00,0.00,USD,COMPLETED,90.00",
  );
  expect(result.candidates).toHaveLength(0);
  expect(result.warnings).toHaveLength(1);
  expect(result.errors[0]).toContain("no coincide con la cuenta");
});

it.each([
  "Resumen en EUR\nFecha;Concepto;Importe\n20/09/2026;Compra;-2,50",
  "Fecha;Concepto;Importe\n20/09/2026;Compra;-2,50EUR",
])("detecta la moneda en la cabecera o en el propio importe", (content) => {
  const file = readTabular(encode(content), "ficticio.csv");
  const result = prepareImport(file, { ...account, currency: "USD" }, [0]);
  expect(result.candidates).toHaveLength(0);
  expect(result.errors[0]).toContain("no coincide");
});

it("N26 usa el importe de la cuenta y combina contraparte/referencia sin usarlas como ID", () => {
  const result = csv(
    "Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate\n2026-09-20,2026-09-21,Tienda ficticia,,Card,-,Principal,-3.50,500,JPY,0.007\n2026-09-21,,Empresa ficticia,,Transfer,Factura ficticia,Principal,50.00,,,\n2026-09-22,,,,Transfer,Abono ficticio,Principal,20.00,,,",
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates.map((c) => c.movement.description)).toEqual([
    "Tienda ficticia",
    "Empresa ficticia",
    "Transfer",
  ]);
  expect(result.candidates.map((c) => c.movement.reference)).toEqual([undefined,"Factura ficticia","Abono ficticio"]);
  expect(result.candidates[0].movement.amount).toBe(-350);
  expect(result.candidates[0].movement).toMatchObject({
    originalAmount: 500,
    originalCurrency: "JPY",
    secondaryDate: "2026-09-21",
  });
  expect(
    result.candidates.every((c) => !Object.hasOwn(c.movement, "externalId")),
  ).toBe(true);
});

it("conserva la hora escrita sin convertir zona y falla en fechas e importes inválidos", () => {
  const result = csv(
    "Fecha;Concepto;Importe\n2026-09-20T12:34:56+02:00;Compra;-2,50\n31/02/2026;Imposible;3,00\n20/09/2026;Inválido;texto",
  );
  expect(result.candidates[0].movement.time).toBe("12:34:56");
  expect(result.candidates[0].movement).not.toHaveProperty("timestamp");
  expect(result.errors).toHaveLength(2);
});

it.each([
  ["Booking Date;Value Date", "20/09/2026;19/09/2026"],
  ["Fecha de operación;Fecha valor", "19/09/2026;20/09/2026"],
  ["Fecha de inicio;Fecha de finalización", "20/09/2026;19/09/2026"],
  ["Fecha principal;Fecha secundaria", "20/09/2026;19/09/2026"],
  [
    "Fecha de operación;Fecha contable;Fecha valor",
    "20/09/2026;19/09/2026;20/09/2026",
  ],
])(
  "guarda la menor y mayor entre las fechas disponibles de %s",
  (header, dates) => {
    const result = csv(
      `${header};Concepto;Importe\n${dates};Compra ficticia;-2,50`,
    );
    expect(result.errors).toEqual([]);
    const m = result.candidates[0].movement;
    expect(m).toMatchObject({
      date: "2026-09-19",
      secondaryDate: "2026-09-20",
    });
    expect(m).not.toHaveProperty("bookingDate");
    expect(m).not.toHaveProperty("valueDate");
    expect(m).not.toHaveProperty("completionDate");
  },
);

it("una fecha única no inventa secundaria; dos iguales se conservan y una fecha inválida no se omite", () => {
  expect(
    csv("Fecha;Concepto;Importe\n20/09/2026;Compra;1").candidates[0].movement
      .secondaryDate,
  ).toBeUndefined();
  expect(
    csv(
      "Booking Date;Value Date;Concepto;Importe\n20/09/2026;20/09/2026;Compra;1",
    ).candidates[0].movement.secondaryDate,
  ).toBe("2026-09-20");
  const bad = csv(
    "Fecha de inicio;Fecha de finalización;Concepto;Importe\n20/09/2026;31/02/2026;Compra;1",
  );
  expect(bad.candidates).toHaveLength(0);
  expect(bad.errors).toHaveLength(1);
});

it("conserva la hora con su fecha aunque quede como secundaria", () => {
  const result = csv(
    "Fecha de operación;Fecha valor;Concepto;Importe\n2026-09-20T12:00:00+02:00;2026-09-19;Compra;1",
  );
  expect(result.candidates[0].movement).toMatchObject({
    date: "2026-09-19",
    secondaryDate: "2026-09-20",
    time: undefined,
    secondaryTime: "12:00:00",
  });
});

it("conserva importe original cero, signo y precisión propia sin convertir la moneda de la cuenta", () => {
  const result = csv(
    "Fecha;Concepto;Importe;Moneda;Importe original;Moneda original\n20/09/2026;Compra ficticia;-5,00;EUR;-800,00;JPY\n21/09/2026;Cero;0;EUR;0;USD\n22/09/2026;Compra;2,00;EUR;1,234;KWD",
  );
  expect(result.errors).toEqual([]);
  expect(
    result.candidates.map(({ movement: m }) => [
      m.amount,
      m.currency,
      m.originalAmount,
      m.originalCurrency,
    ]),
  ).toEqual([
    [-500, "EUR", -800, "JPY"],
    [0, "EUR", 0, "USD"],
    [200, "EUR", 1234, "KWD"],
  ]);
});

it.each([";USD", "10;", "10;US", "texto;GBP", "1,25;JPY", "10 EUR;USD"])(
  "rechaza la pareja original incompleta o inválida %s",
  (pair) => {
    const result = csv(
      `Fecha;Concepto;Importe;Importe original;Moneda original\n20/09/2026;Compra;2,50;${pair}`,
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  },
);

it.each(["GBP", "JPY", "VND"])(
  "N26 PDF conserva moneda original %s y separadores diferentes sin contaminar la cuenta",
  (currency) => {
    const result = prepared([
      readPdfPage(
        [
          text(45, 700, "Descripción"),
          text(356, 700, "Fecha de reserva", 91),
          text(502, 700, "Cantidad"),
          text(44, 675, "Compra ficticia"),
          text(
            44,
            660,
            `Importe original 1200.00 ${currency} | Tipo de cambio 0.12345`,
          ),
          text(44, 645, "Fecha de valor 19.09.2026"),
          text(392, 673, "20.09.2026"),
          text(520, 673, "-2,50€"),
        ],
        1,
        {},
      ),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].movement).toMatchObject({
      amount: -250,
      currency: "EUR",
      originalAmount: currency === "GBP" ? 120000 : 1200,
      originalCurrency: currency,
      exchangeRate: "0.12345",
    });
  },
);

it.each([false, true])(
  "Revolut PDF conserva contraparte y referencia, omite IBAN y cambia de diseño: %s",
  (secondDate) => {
    const x = secondDate ? 166 : 125;
    const sheet = readPdfPage(
      [
        text(400, 800, "Extracto en EUR"),
        text(43, 700, "Fecha"),
        ...(secondDate ? [text(104, 700, "Fecha valor", 42)] : []),
        text(x, 700, "Descripción"),
        text(335, 700, "Dinero saliente", 55),
        text(417, 700, "Dinero entrante", 56),
        text(535, 700, "Saldo"),
        text(43, 675, "20 sep 2026"),
        ...(secondDate ? [text(104, 675, "21 sep 2026")] : []),
        text(x, 675, "Transferencia a Ana Prueba"),
        text(335, 675, "10,50€"),
        text(535, 675, "89,50€"),
        text(x, 660, "Referencia: Reserva ficticia"),
        text(x, 650, "para septiembre"),
        text(x, 640, "A Ana Prueba, ES00" + "0".repeat(20)),
        text(x, 635, "Comisión: 0,50€"),
      ],
      secondDate ? 2 : 1,
      {},
    );
    const result = prepared([sheet]);
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].movement).toMatchObject({
      description: "Transferencia a Ana Prueba", reference: "Reserva ficticia para septiembre",
      merchant: "Ana Prueba",
      notes: "A Ana Prueba",
      fee: 50,
      amount: -1050,
      balance: 8950,
    });
    expect(JSON.stringify(result.candidates[0].movement)).not.toContain("ES00");
  },
);

it.each(["xls", "xlsx"] as const)(
  "contraparte explícita, referencia y privacidad se conservan en %s",
  (bookType) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Fecha", "Concepto", "Contraparte", "Referencia", "Importe", "Notas"],
        [
          "20/09/2026",
          "Transferencia a Ana Prueba",
          "Ana Ejemplo",
          "Reserva ficticia",
          -10,
          "IBAN: ES00" + "0".repeat(20),
        ],
      ]),
      "Datos",
    );
    const result = prepareImport(
      readTabular(
        XLSX.write(book, { type: "array", bookType }),
        `ficticio.${bookType}`,
      ),
      account,
      [0],
    );
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].movement).toMatchObject({
      description: "Transferencia a Ana Prueba", reference: "Reserva ficticia",
      merchant: "Ana Ejemplo",
      notes: "",
      amount: -1000,
    });
  },
);

it("la propuesta de IA no puede omitir contraparte, referencia o notas reconocidas", () => {
  const rows = [
    [
      "Día",
      "Texto libre",
      "Total",
      "Contraparte",
      "Referencia del pago",
      "Notas",
    ],
    [
      "20/09/2026",
      "Transferencia",
      "10,00",
      "Ana Prueba",
      "Factura 01",
      "IBAN: ES00" + "0".repeat(20),
    ],
  ];
  const layout = validateDetectedLayout(
    {
      headerRow: 0,
      dateFormat: "DMY",
      decimal: ",",
      columns: { date: 0, description: 1, amount: 2 },
    },
    rows,
  )!;
  expect(layout.columns).toMatchObject({ merchant: 3, reference: 4, notes: 5 });
  const result = prepareImport(
    { name: "ficticio.csv", sheets: [{ name: "Datos", rows }], warnings: [] },
    account,
    [0],
    { 0: layout },
  );
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    merchant: "Ana Prueba",
    description: "Transferencia", reference: "Factura 01",
    notes: "",
  });
});

it("Revolut PDF separa importe extranjero de importe bruto y comisión sin volver a descontarla", () => {
  const result = prepared([
    readPdfPage(
      [
        text(400, 800, "Extracto en EUR"),
        text(43, 700, "Fecha"),
        text(125, 700, "Descripción"),
        text(335, 700, "Dinero saliente", 55),
        text(417, 700, "Dinero entrante", 56),
        text(535, 700, "Saldo"),
        text(43, 675, "20 sep 2026"),
        text(125, 675, "Compra ficticia"),
        text(335, 675, "26,00€"),
        text(535, 675, "74,00€"),
        text(125, 665, "Comisión: 1,00€. Tipo de cambio: 1€ = 0,80£"),
        text(335, 665, "25,00€"),
        text(335, 655, "20,00£"),
      ],
      1,
      {},
    ),
  ]);
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    amount: -2600,
    balance: 7400,
    originalAmount: 2000,
    originalCurrency: "GBP",
    fee: 100,
    exchangeRate: "1 EUR = 0.80 GBP",
  });
});

it.each([
  ["Conversión a JPY", "2.000¥", "JPY", 2000],
  ["Conversión a USD", "15,25$", "USD", 1525],
  ["Conversión a EUR", "2.000¥", undefined, undefined],
  ["Conversión a EUR", "15,25$", undefined, undefined],
  ["Compra ficticia", "2.000¥", undefined, undefined],
  ["Conversión a JPY", "15,25$", undefined, undefined],
  ["Conversión a USD", "2.000¥", undefined, undefined],
  ["Conversión a JPY", "2.000¥ 3.000¥", undefined, undefined],
] as const)(
  "Revolut PDF resuelve símbolos solo con divisa explícita compatible: %s / %s",
  (concept, foreign, originalCurrency, originalAmount) => {
    const result = prepared([
      readPdfPage(
        [
          text(400, 800, "Extracto en EUR"),
          text(43, 700, "Fecha"),
          text(125, 700, "Descripción"),
          text(335, 700, "Dinero saliente", 55),
          text(417, 700, "Dinero entrante", 56),
          text(535, 700, "Saldo"),
          text(43, 675, "20 sep 2026"),
          text(125, 675, concept),
          text(335, 675, "10,00€"),
          text(535, 675, "90,00€"),
          text(335, 665, foreign),
        ],
        1,
        {},
      ),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.candidates[0].movement).toMatchObject({
      amount: -1000,
      balance: 9000,
      originalAmount,
      originalCurrency,
    });
    expect(result.warnings).toHaveLength(originalCurrency ? 0 : 1);
    if (!originalCurrency)
      expect(result.candidates[0].movement.notes).toContain(foreign);
  },
);

it("reconstruye OpenBank con cabecera partida y concepto centrado de varias líneas", () => {
  const sheet = readPdfPage(
    [
      text(60, 709, "Fecha"),
      text(55, 700, "Operación"),
      text(120, 700, "Fecha Valor", 45),
      text(278, 700, "Concepto"),
      text(441, 700, "Importe", 28),
      text(530, 700, "Saldo"),
      text(57, 675, "20/09/2026"),
      text(122, 675, "21/09/2026"),
      text(180, 680, "COMPRA FICTICIA"),
      text(180, 670, "REFERENCIA DE PRUEBA"),
      text(455, 675, "-2,50 EUR"),
      text(530, 675, "97,50 EUR"),
    ],
    1,
    {},
  );
  const result = prepared([sheet]);
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    description: "COMPRA FICTICIA REFERENCIA DE PRUEBA",
    amount: -250,
    balance: 9750,
  });
});

it("lee Pibank por posiciones, incluyendo una segunda página y saldos negativos", () => {
  const page = (page: number, y: number) =>
    readPdfPage(
      [
        text(25, y, "FECHA"),
        text(96, y, "FECHA VALOR", 71),
        text(176, y, "DESCRIPCION"),
        text(455, y, "IMPORTE", 46),
        text(521, y, "SALDO"),
        text(25, y - 30, "20/09/2026"),
        text(96, y - 30, "20/09/2026"),
        text(176, y - 30, "Compra ficticia"),
        text(480, y - 30, "-2,50"),
        text(535, y - 30, "-1,50"),
      ],
      page,
      {},
    );
  const result = prepared([page(1, 640), page(2, 800)]);
  expect(result.errors).toEqual([]);
  expect(
    result.candidates.map((c) => [
      c.movement.amount,
      c.movement.balance,
      c.page,
    ]),
  ).toEqual([
    [-250, -150, 1],
    [-250, -150, 2],
  ]);
});

it("Revolut cambia de diseño entre páginas y distingue importe original extranjero del neto", () => {
  const context: PdfContext = {};
  const first = readPdfPage(
    [
      text(400, 800, "Extracto en EUR"),
      text(43, 700, "Fecha"),
      text(125, 700, "Descripción"),
      text(335, 700, "Dinero saliente", 55),
      text(417, 700, "Dinero entrante", 56),
      text(535, 700, "Saldo"),
      text(43, 675, "20 sep 2026"),
      text(125, 675, "Compra ficticia"),
      text(335, 675, "2,50€"),
      text(535, 675, "97,50€"),
      text(125, 665, "Comisión incluida: 0,50€"),
    ],
    1,
    context,
  );
  const second = readPdfPage(
    [
      text(43, 705, "Fecha de la"),
      text(43, 690, "transacción"),
      text(104, 700, "Fecha valor", 42),
      text(166, 700, "Descripción"),
      text(335, 700, "Dinero saliente", 55),
      text(417, 700, "Dinero entrante", 56),
      text(535, 700, "Saldo"),
      text(43, 675, "21 sept 2026"),
      text(104, 675, "22 sep 2026"),
      text(166, 675, "Cambio ficticio"),
      text(417, 675, "10,00€"),
      text(535, 675, "107,50€"),
      text(417, 665, "12,00$"),
    ],
    2,
    context,
  );
  const result = prepared([first, second]);
  expect(result.errors).toEqual([]);
  expect(result.candidates.map((c) => c.movement.amount)).toEqual([-250, 1000]);
  expect(result.candidates[1].movement.notes).toContain("12,00$");
  expect(result.candidates[1].movement.secondaryDate).toBe("2026-09-22");
  expect(result.candidates[1].movement.originalCurrency).toBeUndefined();
  expect(result.warnings.some((w) => w.includes("moneda originales"))).toBe(
    true,
  );
});

it("N26 PDF incorpora referencias sin etiqueta, conservando tipo y BIC en notas", () => {
  const result = prepared([
    readPdfPage(
      [
        text(45, 700, "Descripción"),
        text(356, 700, "Fecha de reserva", 91),
        text(502, 700, "Cantidad"),
        text(44, 675, "Ana Prueba"),
        text(392, 673, "20.09.2026"),
        text(520, 673, "10,00€"),
        text(44, 665, "Ingresos"),
        text(44, 655, "IBAN: ES00 0000 0000"),
        text(44, 645, "0000 0000 0000 · BIC: FAKEESXX"),
        text(44, 635, "Reserva ficticia"),
        text(44, 625, "para septiembre"),
        text(44, 615, "Fecha de valor 20.09.2026"),
      ],
      1,
      {},
    ),
  ]);
  expect(result.errors).toEqual([]);
  expect(result.candidates[0].movement).toMatchObject({
    description: "Ana Prueba", reference: "Reserva ficticia para septiembre",
    merchant: "Ana Prueba",
    notes: "Ingresos\n· BIC: FAKEESXX",
    amount: 1000,
  });
  expect(JSON.stringify(result.candidates[0].movement)).not.toContain("ES00");
});

it("N26 une los bloques y distingue páginas informativas, vacías y desconocidas", () => {
  const context: PdfContext = {};
  const page = readPdfPage(
    [
      text(45, 700, "Descripción"),
      text(356, 700, "Fecha de reserva", 91),
      text(502, 700, "Cantidad"),
      text(44, 675, "Tienda ficticia"),
      text(44, 660, "Pago con tarjeta"),
      text(44, 645, "Fecha de valor 21.09.2026"),
      text(392, 673, "20.09.2026"),
      text(520, 673, "-2,50€"),
    ],
    1,
    context,
  );
  const summary = readPdfPage(
    [
      text(45, 700, "Descripción"),
      text(44, 676, "Saldo previo"),
      text(44, 650, "Transacciones salientes"),
      text(44, 624, "Transacciones entrantes"),
    ],
    2,
    context,
  );
  const legal = readPdfPage(
    [text(44, 676, "Información legal ficticia sin operaciones")],
    3,
    context,
  );
  const empty = readPdfPage([], 4, context);
  const unknown = readPdfPage(
    [
      text(44, 600, "Columna desconocida"),
      text(44, 575, "20.09.2026"),
      text(400, 575, "-2,50"),
    ],
    5,
    context,
  );
  const result = prepared([page, summary, legal]);
  expect(result.errors).toEqual([]);
  expect(result.informational).toBe(2);
  expect(result.candidates[0].movement).toMatchObject({
    description: "Tienda ficticia",
    merchant: "Tienda ficticia",
    amount: -250,
    balance: undefined,
    secondaryDate: "2026-09-21",
  });
  expect(prepared([empty, unknown]).unknown).toHaveLength(2);
});

it("no pierde operaciones con fecha imposible o ausente en una tabla PDF conocida", () => {
  const page = readPdfPage(
    [
      text(40, 700, "Fecha"),
      text(160, 700, "Concepto"),
      text(400, 700, "Importe"),
      text(40, 675, "31/02/2026"),
      text(160, 675, "Fecha imposible"),
      text(400, 675, "-2,50"),
      text(160, 650, "Sin fecha"),
      text(400, 650, "-1,00"),
    ],
    1,
    {},
  );
  expect(prepared([page]).errors).toHaveLength(2);
});

it("interpreta rangos de 50 páginas, normaliza solapamientos y conserva el orden físico", () => {
  expect(parsePageRanges("1-29", 50)).toEqual(
    Array.from({ length: 29 }, (_, i) => i + 1),
  );
  expect(parsePageRanges("20-22, 1-3, 2, 3-4, 50", 50)).toEqual([
    1, 2, 3, 4, 20, 21, 22, 50,
  ]);
  expect(parsePageRanges(" 1 - 3 , 12 ", 50)).toEqual([1, 2, 3, 12]);
});
it.each([
  "",
  " ",
  "0",
  "51",
  "1-51",
  "29-1",
  "1-",
  "1,,2",
  "2.5",
  "-1",
  "999999999999999999999",
])("rechaza el rango inválido %s", (range) => {
  expect(() => parsePageRanges(range, 50)).toThrow();
});
it("las fechas escritas no dependen de la zona horaria ni aceptan meses imposibles", () => {
  expect(pdfDate("2 dic 2026")).toBe("2026-12-02");
  expect(pdfDate("31 feb 2026")).toBeUndefined();
  expect(pdfDate("2 inexistente 2026")).toBeUndefined();
});
