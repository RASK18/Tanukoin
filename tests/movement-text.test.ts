import { expect, it } from "vitest";
import {
  containsIban,
  normalizeImportedText,
  removeIbans,
} from "../src/lib/movement-text";
import { prepareImport } from "../src/features/import/prepare";
import { readTabular } from "../src/features/import/tabular";

// Intentionally invalid, entirely fictitious account numbers.
const iban = "ES00" + "0".repeat(20);
const printIban = iban.match(/.{1,4}/g)!.join(" ");
const account = { id: "a", name: "Cuenta ficticia", bank: "", currency: "EUR" };

it.each([
  ["Pago de LUCÍA EJEMPLO", "LUCÍA EJEMPLO"],
  ["Transferencia a Bruno Prueba", "Bruno Prueba"],
  [
    "Transferencia SEPA inmediata a favor de Empresa Ficticia",
    "Empresa Ficticia",
  ],
  ["Compra con tarjeta 1234 en TIENDA FICTICIA", "TIENDA FICTICIA"],
  ["To Ana Prueba", "Ana Prueba"],
  ["Payment from Example Company", "Example Company"],
  ["Recibo de Asociación Ficticia", "Asociación Ficticia"],
  ["Conversión a EUR", ""],
  ["Intereses del mes", ""],
  ["Transferencia emitida", ""],
  ["Transferencia de prueba", ""],
  ["Transferencia de fondos", ""],
  ["Compra ficticia", ""],
])("extrae contraparte solo con evidencia: %s", (description, merchant) => {
  expect(normalizeImportedText({ description }).merchant).toBe(merchant);
});

it("prioriza la contraparte explícita y concatena la referencia sin incorporarla al nombre", () => {
  const result = normalizeImportedText({
    description: "Pago de Ana Prueba",
    merchant: "Ana Ejemplo",
    reference: "Excursión ficticia",
  });
  expect(result).toEqual({
    description: "Pago de Ana Prueba. Excursión ficticia",
    merchant: "Ana Ejemplo",
    notes: "",
  });
  expect(
    normalizeImportedText({ ...result, reference: "Excursión ficticia" }),
  ).toEqual(result);
});

it("mueve referencias etiquetadas y multilínea al concepto sin confundir los detalles siguientes", () => {
  const result = normalizeImportedText({
    description: "Transferencia a Ana Prueba",
    notes: `Referencia: Excursión ficticia\nreserva de septiembre\nA Ana Prueba, ${printIban}\nTarjeta: 1234\nComisión: 0,50 EUR`,
  });
  expect(result).toEqual({
    description:
      "Transferencia a Ana Prueba. Excursión ficticia reserva de septiembre",
    merchant: "Ana Prueba",
    notes: "A Ana Prueba\nTarjeta: 1234\nComisión: 0,50 EUR",
  });
  expect(normalizeImportedText(result)).toEqual(result);
  expect(
    normalizeImportedText({
      description: "Transferencia a Ana Prueba. Referencia: Excursión ficticia",
    }),
  ).toMatchObject({
    description: "Transferencia a Ana Prueba. Excursión ficticia",
    merchant: "Ana Prueba",
  });
});

it("no interpreta una nota libre como contraparte ni duplica referencias ya presentes", () => {
  expect(
    normalizeImportedText({
      description: "Transferencia",
      notes: "De vuelta de vacaciones",
    }).merchant,
  ).toBe("");
  expect(
    normalizeImportedText({
      description: "Pago. Factura F-001",
      reference: "Factura F-001",
    }).description,
  ).toBe("Pago. Factura F-001");
  expect(
    normalizeImportedText({ description: "", reference: "-" }).description,
  ).toBe("Sin concepto");
});

it.each([
  iban,
  printIban,
  printIban.toLowerCase(),
  printIban.replaceAll(" ", "\n"),
  printIban.replaceAll(" ", "-"),
  "GB00FAKE" + "0".repeat(14),
  "LT00" + "0".repeat(16),
  "FR00" + "0".repeat(23),
  "ES00" + "*".repeat(20),
])("retira IBAN compactos, separados y enmascarados: %s", (value) => {
  expect(containsIban(value)).toBe(true);
  expect(removeIbans(`De Ana Prueba, ${value}\nOtro detalle`)).toBe(
    "De Ana Prueba\nOtro detalle",
  );
  expect(
    normalizeImportedText({
      description: `Pago de Ana Prueba, ${value}`,
      merchant: `Ana Prueba, ${value}`,
      reference: `Factura 01, ${value}`,
      notes: `IBAN: ${value}`,
    }),
  ).toEqual({
    description: "Pago de Ana Prueba. Factura 01",
    merchant: "Ana Prueba",
    notes: "",
  });
});

it("preserva referencias, nombres y números de tarjeta que no son IBAN", () => {
  const text =
    "Factura F-002. Tarjeta: 1234. Pedido 202609001. Referencia ES2026";
  expect(removeIbans(text)).toBe(text);
  expect(containsIban(text)).toBe(false);
});

it("una referencia en columna se guarda en el concepto y los IBAN no afectan a duplicados", () => {
  const file = (name: string, ref: string, code: string) =>
    readTabular(
      new TextEncoder().encode(
        `Fecha;Concepto;Referencia del pago;Importe;Saldo;Notas\n20/09/2026;Pago de ${name}, ${code};${ref};10,00;20,00;IBAN: ${code}`,
      ).buffer,
      "ficticio.csv",
    );
  const first = prepareImport(
    file("Ana Prueba", "Factura 01", printIban),
    account,
    [0],
  );
  expect(first.errors).toEqual([]);
  const m = first.candidates[0].movement;
  expect(m).toMatchObject({
    merchant: "Ana Prueba",
    description: "Pago de Ana Prueba. Factura 01",
    notes: "",
  });
  expect(JSON.stringify(m)).not.toContain("ES00");
  const repeat = prepareImport(
    file("Ana Prueba", "Factura 01", iban),
    account,
    [0],
    {},
    [m],
  );
  expect(repeat.candidates[0]).toMatchObject({
    duplicate: "possible",
    selected: false,
  });
  const different = prepareImport(
    file("Ana Prueba", "Factura 02", iban),
    account,
    [0],
    {},
    [m],
  );
  expect(different.candidates[0]).toMatchObject({
    duplicate: "none",
    selected: true,
  });
});
