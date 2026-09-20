import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
let network = false;
const nativeFetch = self.fetch.bind(self);
self.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
    self.location.href,
  );
  if (url.origin !== self.location.origin && !network)
    return Promise.reject(
      new Error(
        "Faltan recursos del chat en caché. Descarga o comprueba el modelo en IA local.",
      ),
    );
  return nativeFetch(input, init);
}) as typeof fetch;
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => {
  if (event.data?.tanukoinNetwork !== undefined)
    network = event.data.tanukoinNetwork === true;
  else handler.onmessage(event);
};
