import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
const origin =
  process.env.SITE_ORIGIN ||
  (process.env.GITHUB_REPOSITORY
    ? `https://${process.env.GITHUB_REPOSITORY.split("/")[0].toLowerCase()}.github.io`
    : "http://127.0.0.1:5173");
if (
  !/^https:\/\/[^/]+$/.test(origin) &&
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
)
  throw new Error("SITE_ORIGIN debe ser un origen HTTPS, sin ruta");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = {
  manifest_version: 3,
  name: "Tanukoin · Conector bancario local",
  version: pkg.version,
  description:
    "Conecta tu propia aplicación Enable Banking con Tanukoin. Sin servidor intermediario.",
  host_permissions: ["https://api.enablebanking.com/*"],
  background: { service_worker: "background.js", type: "module" },
  content_scripts: [
    {
      matches: [`${origin}/Tanukoin/*`],
      js: ["bridge.js"],
      run_at: "document_start",
    },
  ],
  icons: { 192: "icon-192.png" },
};
await mkdir("extension-dist", { recursive: true });
await mkdir("dist/extension", { recursive: true });
const files = {
  "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
  "config.js": strToU8(
    `export const allowedOrigin = ${JSON.stringify(origin)};\n`,
  ),
};
for (const name of ["background.js", "bridge.js", "request.mjs"])
  files[name] = new Uint8Array(await readFile(`extension/${name}`));
files["icon-192.png"] = new Uint8Array(await readFile("public/icon-192.png"));
files["LICENSE.md"] = new Uint8Array(await readFile("LICENSE.md"));
for (const [name, bytes] of Object.entries(files))
  await writeFile(`extension-dist/${name}`, bytes);
await writeFile("dist/extension/tanukoin-extension.zip", zipSync(files));
console.log(`Extensión preparada para ${origin}/Tanukoin/`);
