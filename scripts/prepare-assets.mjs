import { mkdir, readdir, copyFile, cp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
// Retire the generated CPU runtime; model weights live separately in the browser.
await rm("public/wllama/wllama.wasm", { force: true });
const require = createRequire(import.meta.url);
const transformer = require.resolve("@huggingface/transformers");
const onnx = dirname(
  require.resolve("onnxruntime-web", { paths: [dirname(transformer)] }),
);
await mkdir("public/onnx", { recursive: true });
for (const name of await readdir(onnx))
  if (name.endsWith(".wasm") || name.endsWith(".mjs"))
    await copyFile(join(onnx, name), join("public/onnx", name));
const pdf = dirname(require.resolve("pdfjs-dist/package.json"));
for (const folder of ["cmaps", "standard_fonts", "wasm"])
  await cp(join(pdf, folder), `public/pdf/${folder}`, { recursive: true });
console.log("Recursos PDF y WebAssembly preparados para uso local.");
