import { afterEach, expect, it } from "vitest";
import {
  loadCredentials,
  jwt,
  clearCredentials,
  normalizeBankTransactions,
} from "../src/features/banking/client";
afterEach(clearCredentials);
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
        remittance_information: ["Compra", "supermercado"],
        entry_reference: "ref",
      },
      { status: "PDNG", transaction_amount: { amount: "1", currency: "EUR" } },
    ],
    account,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].amount).toBe(-1234);
  expect(rows[0].timestamp).toBeUndefined();
  expect(rows[0].externalId).toBe("ref");
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
