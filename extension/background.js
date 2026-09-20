import { buildRequest, trustedSender } from "./request.mjs";
import { allowedOrigin } from "./config.js";
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!trustedSender(sender.url, allowedOrigin) || sender.frameId !== 0) {
    respond({ error: "Origen no autorizado" });
    return false;
  }
  (async () => {
    try {
      const request = buildRequest(message, allowedOrigin);
      if (!request) {
        respond({
          result: {
            connected: true,
            version: chrome.runtime.getManifest().version,
          },
        });
        return;
      }
      const response = await fetch(request.url, {
        ...request.options,
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const labels = {
          401: "Credenciales o sesión caducadas. Vuelve a autorizar.",
          403: "Acceso rechazado. Revisa las cuentas vinculadas.",
          429: "Límite de peticiones. Espera antes de reintentar.",
        };
        throw new Error(
          labels[response.status] ||
            `Enable Banking respondió ${response.status}. No se han modificado tus datos.`,
        );
      }
      respond({ result: response.status === 204 ? {} : await response.json() });
    } catch (error) {
      respond({
        error:
          error instanceof Error
            ? error.message
            : "No se pudo conectar con el banco",
      });
    }
  })();
  return true;
});
