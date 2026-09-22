/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import {
  addPlugins,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

function isolated(response: Response) {
  if (response.type === "opaque" || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
// Wrap both cached and freshly fetched application responses using the same routing pipeline.
addPlugins([
  { handlerWillRespond: async ({ response }) => isolated(response) },
]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/Tanukoin/index.html"), {
    denylist: [/bank-callback\.html/, /tests\/browser\//],
  }),
);
registerRoute(
  ({ url }) => url.origin === self.location.origin,
  async ({ request, url }) => {
    try {
      return isolated(await fetch(request));
    } catch (error) {
      const cached = await matchPrecache(url.pathname);
      if (cached) return isolated(cached);
      throw error;
    }
  },
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
clientsClaim();
