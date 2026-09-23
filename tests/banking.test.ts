import { afterEach, expect, it } from "vitest";
import {
  loadCredentials,
  jwt,
  clearCredentials,
  normalizeBankTransactions,
} from "../src/features/banking/client";
afterEach(clearCredentials);
it("la conexión conserva ambas horas escritas sin convertirlas a la zona del navegador", () => {
  const [m] = normalizeBankTransactions(
    [
      {
        credit_debit_indicator: "DBIT",
        transaction_amount: { amount: "1", currency: "EUR" },
        transaction_date: "2026-09-20T23:30:00-05:00",
        booking_date: "2026-09-21T04:30:00Z",
      },
    ],
    { id: "a", name: "Cuenta ficticia", bank: "", currency: "EUR" },
  );
  expect(m).toMatchObject({
    date: "2026-09-20",
    time: "23:30:00",
    secondaryDate: "2026-09-21",
    secondaryTime: "04:30:00",
  });
  expect(m).not.toHaveProperty("timestamp");
});
it.each(["DBIT", "CRDT"])(
  "la conexión bancaria conserva contraparte y referencia sin IBAN: %s",
  (direction) => {
    const iban = "ES00" + "0".repeat(20);
    const [m] = normalizeBankTransactions(
      [
        {
          credit_debit_indicator: direction,
          transaction_amount: { amount: "12.00", currency: "EUR" },
          booking_date: "2026-09-20",
          creditor: {
            name:
              direction === "DBIT" ? `Ana Prueba, ${iban}` : "Titular ficticio",
          },
          debtor: {
            name:
              direction === "CRDT" ? `Ana Prueba, ${iban}` : "Titular ficticio",
          },
          remittance_information: ["Factura 01", iban],
        },
      ],
      { id: "a", name: "Principal", bank: "", currency: "EUR" },
    );
    expect(m).toMatchObject({
      merchant: "Ana Prueba",
      description: "Ana Prueba. Factura 01",
      notes: "",
    });
    expect(JSON.stringify(m)).not.toContain(iban);
  },
);
it("firma JWT verificable con la clave en memoria y la olvida al desconectar", async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  await loadCredentials("12345678-1234-4234-8234-123456789012", pem);
  const token = await jwt();
  const [header, payload, signature] = token.split(".");
  expect(
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keys.publicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toBe(true);
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  expect(claims.aud).toBe("api.enablebanking.com");
  expect(claims.exp - claims.iat).toBe(300);
  clearCredentials();
  await expect(jwt()).rejects.toThrow("PEM");
});
it("normaliza cargos contabilizados conservando fechas sin inventar horas", () => {
  const account = { id: "a", name: "Cuenta", bank: "", currency: "EUR" };
  const rows = normalizeBankTransactions(
    [
      {
        status: "BOOK",
        credit_debit_indicator: "DBIT",
        transaction_amount: { amount: "12.34", currency: "EUR" },
        booking_date: "2026-09-20",
        value_date: "2026-09-19",
        remittance_information: ["Compra", "supermercado"],
        entry_reference: "ref",
      },
      { status: "PDNG", transaction_amount: { amount: "1", currency: "EUR" } },
    ],
    account,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].amount).toBe(-1234);
  expect(rows[0]).not.toHaveProperty("timestamp");
  expect(rows[0].time).toBeUndefined();
  expect(rows[0]).toMatchObject({
    date: "2026-09-19",
    secondaryDate: "2026-09-20",
  });
  expect(rows[0]).not.toHaveProperty("bookingDate");
  expect(rows[0]).not.toHaveProperty("externalId");
  expect(() =>
    normalizeBankTransactions(
      [
        {
          credit_debit_indicator: "DBIT",
          transaction_amount: { amount: "1", currency: "USD" },
        },
      ],
      account,
    ),
  ).toThrow("moneda");
});
