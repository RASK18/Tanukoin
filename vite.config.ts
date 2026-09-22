import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
let count = pkg.version.split(".")[2];
try {
  count = execSync("git rev-list --count HEAD", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  /* archive without git */
}
const version =
  process.env.APP_VERSION?.trim() ||
  `${pkg.version.split(".").slice(0, 2).join(".")}.${count}`;
const versionJson = JSON.stringify({
  version,
  updatedAt: process.env.APP_UPDATED_AT || new Date().toISOString(),
});
export default defineConfig({
  base: "/Tanukoin/",
  plugins: [
    react(),
    {
      name: "tanukoin-version",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0].endsWith("/version.json")) {
            res.setHeader("Content-Type", "application/json");
            res.end(versionJson);
          } else next();
        });
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: versionJson,
        });
      },
    },
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: [
        "tanu.webp",
        "icon-192.png",
        "icon-512.png",
        "bank-callback.html",
        "bank-callback.js",
      ],
      manifest: {
        name: "Tanukoin · Finanzas locales",
        short_name: "Tanukoin",
        lang: "es",
        description: "Tus finanzas, en tus manos",
        theme_color: "#285c49",
        background_color: "#f7f8f5",
        display: "standalone",
        start_url: "/Tanukoin/",
        scope: "/Tanukoin/",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: [
          "**/*.{js,mjs,css,html,json,wasm,bin,webp,png,bcmap,pfb,ttf,woff2,webmanifest}",
        ],
        globIgnores: ["version.json", "extension/**"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: "/Tanukoin/index.html",
        navigateFallbackDenylist: [/bank-callback\.html/],
        runtimeCaching: [],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: "es" },
  build: {
    chunkSizeWarningLimit: 2000,
    ...(process.env.TANUKOIN_AI_EVAL === "1"
      ? {
          rollupOptions: {
            input: {
              app: "index.html",
              evaluation: "tests/browser/ai-harness.html",
            },
          },
        }
      : {}),
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
  },
});
