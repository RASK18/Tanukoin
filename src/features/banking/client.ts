import { db } from "../../data/db";
import type { Account, Movement } from "../../data/types";
import {
  fingerprint,
  parseAmount,
  sourceDateTime,
  movementDateRange,
} from "../../lib/finance";
import { normalizeImportedText } from "../../lib/movement-text";
export interface Bank {
  name: string;
  country: string;
  maximum_consent_validity?: number;
}
export interface BankAccount {
  uid: string;
  name?: string;
  currency: string;
  account_id?: { iban?: string };
  identification_hash?: string;
}
export interface BankSession {
  session_id: string;
  accounts: BankAccount[];
  aspsp: Bank;
  access: { valid_until: string };
}
let key: CryptoKey | null = null;
let appId = "";
let session: BankSession | null = null;
export const getSession = () => session;
export function clearCredentials() {
  key = null;
  appId = "";
  session = null;
}
export async function loadCredentials(id: string, pem: string) {
  if (!/^[\da-f-]{36}$/i.test(id))
    throw new Error("El identificador debe ser el UUID de tu aplicación.");
  if (!pem.includes("-----BEGIN PRIVATE KEY-----"))
    throw new Error(
      "Utiliza el PEM PKCS#8 generado por el panel de Enable Banking (BEGIN PRIVATE KEY).",
    );
  const bytes = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")),
    (c) => c.charCodeAt(0),
  );
  key = await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  appId = id;
  bytes.fill(0);
}
function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
export async function jwt() {
  if (!key) throw new Error("Carga tu archivo PEM para conectar.");
  const now = Math.floor(Date.now() / 1000),
    enc = new TextEncoder();
  const token = [
    { typ: "JWT", alg: "RS256", kid: appId },
    {
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 300,
    },
  ]
    .map((v) => base64(enc.encode(JSON.stringify(v))))
    .join(".");
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    enc.encode(token),
  );
  return `${token}.${base64(new Uint8Array(signature))}`;
}
export async function bankRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) throw new Error("Autorización cancelada.");
  if (!(await db.settings.get("main"))?.banking)
    throw new Error("Activa la conexión bancaria en Ajustes.");
  const token = action === "ping" ? undefined : await jwt();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      reject(new Error("Autorización cancelada."));
    };
    const timer = setTimeout(
      () => {
        window.removeEventListener("message", listener);
        signal?.removeEventListener("abort", cancel);
        reject(
          new Error(
            action === "ping"
              ? "No se ha detectado la extensión. Instálala y recarga esta página."
              : "La conexión ha tardado demasiado. Puedes reintentar.",
          ),
        );
      },
      action === "ping" ? 2500 : 35000,
    );
    const listener = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.channel !== "tanukoin-bank-response" ||
        event.data.id !== id
      )
        return;
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      signal?.removeEventListener("abort", cancel);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    window.addEventListener("message", listener);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    window.postMessage(
      { channel: "tanukoin-bank-request", id, action, token, payload },
      location.origin,
    );
  });
}

export async function authorize(
  bank: Bank,
  signal?: AbortSignal,
): Promise<BankSession> {
  if (typeof BroadcastChannel === "undefined")
    throw new Error(
      "El navegador no admite el retorno seguro de la autorización bancaria.",
    );

  if (signal?.aborted) throw new Error("Autorización cancelada.");

  const popup = window.open(
    "about:blank",
    "tanukoin-bank",
    "width=600,height=780",
  );
  if (!popup)
    throw new Error("Permite abrir la ventana de autorización del banco.");
  const state = crypto.randomUUID();
  try {
    const result = await bankRequest<{ url: string }>(
      "authorize",
      {
        aspsp: bank,
        state,
        redirect_url: `${location.origin}${import.meta.env.BASE_URL}bank-callback.html`,
        valid_until: new Date(
          Date.now() +
            Math.min(bank.maximum_consent_validity || 30 * 86400, 30 * 86400) *
              1000,
        ).toISOString(),
      },
      signal,
    );
    if (signal?.aborted) throw new Error("Autorización cancelada.");

    const url = new URL(result.url);
    if (
      url.protocol !== "https:" ||
      !(
        url.hostname === "enablebanking.com" ||
        url.hostname.endsWith(".enablebanking.com")
      )
    )
      throw new Error(
        "El proveedor devolvió una URL de autorización inesperada.",
      );
    const code = await new Promise<string>((resolve, reject) => {
      const channel = new BroadcastChannel(`tanukoin-bank-auth:${state}`);

      const cleanup = () => {
        clearTimeout(timeout);
        channel.close();
        signal?.removeEventListener("abort", cancel);
      };

      const cancel = () => {
        cleanup();
        reject(new Error("Autorización cancelada."));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("La autorización ha caducado. Vuelve a iniciarla."));
      }, 10 * 60000);

      channel.onmessage = (event: MessageEvent) => {
        if (
          event.data?.channel !== "tanukoin-bank-auth" ||
          event.data.state !== state
        )
          return;
        cleanup();

        if (
          event.data.error ||
          typeof event.data.code !== "string" ||
          !event.data.code
        )
          reject(new Error("Autorización cancelada o rechazada."));
        else resolve(event.data.code);
      };

      signal?.addEventListener("abort", cancel, { once: true });

      if (signal?.aborted) {
        cancel();
        return;
      }

      // COOP can sever the popup proxy: popup.closed does not mean the user cancelled.

      try {
        popup.location.href = url.href;
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    if (signal?.aborted) throw new Error("Autorización cancelada.");

    const authorized = await bankRequest<BankSession>(
      "session",
      { code },
      signal,
    );
    if (signal?.aborted) throw new Error("Autorización cancelada.");

    session = authorized;

    return session;
  } finally {
    popup.close();
  }
}
export async function revoke() {
  if (session) await bankRequest("revoke", { id: session.session_id });
  clearCredentials();
}
export function normalizeBankTransactions(
  rows: Record<string, any>[],
  account: Account,
): Movement[] {
  return rows
    .filter((r) => !r.status || r.status === "BOOK")
    .map((r) => {
      if (!["DBIT", "CRDT"].includes(r.credit_debit_indicator))
        throw new Error(
          "El banco devolvió un movimiento sin dirección de importe.",
        );
      const currency = r.transaction_amount?.currency || account.currency;
      if (currency !== account.currency)
        throw new Error("El banco devolvió una moneda distinta a la cuenta.");
      const reference = Array.isArray(r.remittance_information)
        ? r.remittance_information.join(" ")
        : String(r.remittance_information || "");
      const merchant =
        r.credit_debit_indicator === "DBIT" ? r.creditor?.name : r.debtor?.name;
      const text = normalizeImportedText({
        description: "",
        merchant: merchant || "",
        reference,
        fallback: "Movimiento bancario",
      });
      const dates = [r.transaction_date, r.booking_date, r.value_date]
        .filter(Boolean)
        .map((raw) => sourceDateTime(raw, "YMD"));
      if (!dates.length)
        throw new Error("El banco devolvió un movimiento sin fecha.");
      const m: Movement = {
        id: crypto.randomUUID(),
        accountId: account.id,
        amount:
          Math.abs(parseAmount(r.transaction_amount?.amount, ".", currency)) *
          (r.credit_debit_indicator === "DBIT" ? -1 : 1),
        currency,
        description: text.description,
        reference: text.reference,
        merchant: text.merchant,
        ...movementDateRange(dates),
        categorySource: "none",
        tagIds: [],
        notes: text.notes,
        source: "Enable Banking",
        fingerprint: "",
        createdAt: new Date().toISOString(),
      };
      m.fingerprint = fingerprint(m);
      return m;
    });
}
export async function transactions(
  id: string,
  from: string,
  to: string,
  account: Account,
  signal?: AbortSignal,
) {
  const all: Record<string, any>[] = [];
  let continuation: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    if (signal?.aborted) throw new Error("Consulta cancelada.");
    const result = await bankRequest<{
      transactions: Record<string, any>[];
      continuation_key?: string;
    }>("transactions", { id, from, to, continuation });
    all.push(...result.transactions);
    continuation = result.continuation_key;
    if (!continuation) return normalizeBankTransactions(all, account);
    if (seen.has(continuation))
      throw new Error(
        "El banco repitió una página. No se han importado datos.",
      );
    seen.add(continuation);
  }
  throw new Error("Demasiadas páginas. Consulta un período más pequeño.");
}
