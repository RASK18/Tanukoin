import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import {
  authorize,
  clearCredentials,
  getSession,
  loadCredentials,
} from "../src/features/banking/client";

let channel: {
  name: string;
  onmessage?: (event: any) => void;
  close: ReturnType<typeof vi.fn>;
};
let sent: any[];
let popup: {
  closed: boolean;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};
beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put({
    id: "main",
    maps: false,
    search: false,
    banking: true,
    timezone: "UTC",
  });
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
  sent = [];
  popup = { closed: true, location: { href: "" }, close: vi.fn() };
  const listeners = new Set<(event: any) => void>();
  const win = {
    open: () => popup,
    addEventListener: (_type: string, fn: any) => listeners.add(fn),
    removeEventListener: (_type: string, fn: any) => listeners.delete(fn),
    postMessage: (message: any) => {
      sent.push(message);
      queueMicrotask(() => {
        for (const listener of listeners)
          listener({
            origin: "https://example.test",
            source: win,
            data: {
              channel: "tanukoin-bank-response",
              id: message.id,
              result:
                message.action === "authorize"
                  ? { url: "https://enablebanking.com/auth" }
                  : { session_id: "fake", accounts: [] },
            },
          });
      });
    },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("location", { origin: "https://example.test" });
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      name: string;
      close = vi.fn();
      onmessage?: (event: any) => void;
      constructor(name: string) {
        this.name = name;
        channel = this;
      }
    },
  );
});
afterEach(() => {
  clearCredentials();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const bank = { name: "Banco ficticio", country: "ES" };
const waitChannel = () =>
  vi.waitFor(() => expect(popup.location.href).toContain("enablebanking.com"));
const deliver = (payload: object) =>
  channel.onmessage?.({
    data: {
      channel: "tanukoin-bank-auth",
      state: channel.name.split(":")[1],
      ...payload,
    },
  });
it("recibe el retorno pese a la separación COOP y descarta un state incorrecto", async () => {
  const request = authorize(bank);
  await waitChannel();
  deliver({ state: "incorrecto", code: "no-usar" });
  expect(sent.filter((m) => m.action === "session")).toHaveLength(0);
  deliver({ code: "codigo-ficticio" });
  expect((await request).session_id).toBe("fake");
  expect(sent.find((m) => m.action === "session").payload).toEqual({
    code: "codigo-ficticio",
  });
  expect(channel.close).toHaveBeenCalledOnce();
});
it("rechaza una autorización denegada sin crear sesión", async () => {
  const request = authorize(bank);
  const rejected = expect(request).rejects.toThrow("rechazada");
  await waitChannel();
  deliver({ error: "access_denied" });
  await rejected;
  expect(getSession()).toBeNull();
});
it("cancela explícitamente y limpia canal y ventana", async () => {
  const abort = new AbortController();
  const request = authorize(bank, abort.signal);
  const rejected = expect(request).rejects.toThrow("cancelada");
  await waitChannel();
  abort.abort();
  await rejected;
  expect(channel.close).toHaveBeenCalledOnce();
  expect(popup.close).toHaveBeenCalledOnce();
  expect(getSession()).toBeNull();
});
it("caduca a los diez minutos y no toma popup.closed como cancelación", async () => {
  vi.useFakeTimers();
  const request = authorize(bank);
  const rejected = expect(request).rejects.toThrow("caducado");
  await waitChannel();
  await vi.advanceTimersByTimeAsync(599000);
  expect(channel.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  expect(channel.close).toHaveBeenCalledOnce();
});
