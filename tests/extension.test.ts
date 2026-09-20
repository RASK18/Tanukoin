import { expect, it } from "vitest";
// @ts-expect-error Plain JavaScript boundary, shared with the extension service worker.
import { buildRequest, trustedSender } from "../extension/request.mjs";
const token = "abc.def.ghi",
  origin = "https://example.github.io",
  uuid = "12345678-1234-4234-8234-123456789012";
it("solo permite origen y ruta de Tanukoin", () => {
  expect(trustedSender(`${origin}/Tanukoin/`, origin)).toBe(true);
  expect(trustedSender(`${origin}/Other/`, origin)).toBe(false);
  expect(trustedSender("https://evil.example/Tanukoin/", origin)).toBe(false);
});
it("rechaza pagos, URLs arbitrarias y rutas inyectadas", () => {
  expect(() => buildRequest({ action: "payments", token }, origin)).toThrow();
  expect(() =>
    buildRequest(
      {
        action: "transactions",
        token,
        payload: { id: "../../payments", from: "2026-01-01", to: "2026-09-01" },
      },
      origin,
    ),
  ).toThrow();
  const req = buildRequest(
    {
      action: "transactions",
      token,
      payload: {
        id: uuid,
        from: "2026-01-01",
        to: "2026-09-01",
        continuation: "opaque+key",
      },
    },
    origin,
  );
  expect(req.url).toContain("continuation_key=opaque%2Bkey");
  expect(req.options.redirect).toBe("error");
});
it("no permite redirigir la autorización a otro sitio", () => {
  expect(() =>
    buildRequest(
      {
        action: "authorize",
        token,
        payload: {
          aspsp: { name: "Banco", country: "ES" },
          state: uuid,
          redirect_url: "https://evil.example",
          valid_until: new Date().toISOString(),
        },
      },
      origin,
    ),
  ).toThrow();
});
