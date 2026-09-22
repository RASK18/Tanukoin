# Atribuciones

Tanukoin: AGPL-3.0-only. Cada dependencia mantiene su licencia; sus avisos se conservan en los paquetes y recursos redistribuidos.

| Componente                                              | Licencia                         |
| ------------------------------------------------------- | -------------------------------- |
| React, React Router, Vite, Dexie, Recharts, Papa Parse  | MIT                              |
| TypeScript, SheetJS CE 0.20.3, PDF.js                   | Apache-2.0                       |
| Leaflet                                                 | BSD-2-Clause                     |
| Lucide                                                  | ISC                              |
| Transformers.js y WebLLM                                | Apache-2.0                       |
| ONNX Runtime                                            | MIT                              |
| MiniLM multilingüe (Xenova) y Qwen3.5 0.8B, 2B, 4B y 9B | Apache-2.0                       |
| Workbox, Playwright                                     | MIT / Apache-2.0 respectivamente |
| vite-plugin-pwa, Vitest, fflate, Prettier               | MIT                              |
| Rollup, variante oficial @rollup/wasm-node              | MIT                              |

SheetJS se obtiene de su distribución oficial. Los recursos de PDF.js conservan sus avisos específicos de fuentes. Los modelos se descargan directamente desde los proveedores identificados en IA local; sus pesos no están incluidos en este repositorio.

Mapas: © OpenStreetMap contributors, ODbL y política de uso de teselas. Photon utiliza datos de OpenStreetMap. Los resultados de Wikipedia enlazan al artículo de origen y se rigen por sus condiciones de atribución.

KashaFlow se cita como inspiración funcional; no se ha incorporado su código. La ilustración raster de Tanu se generó originalmente para Tanukoin. Los SVG de interfaz proceden de Lucide y de bibliotecas de gráficos, no se dibujan manualmente.

Modelos de chat: Qwen3.5 de Alibaba/Qwen (Apache-2.0), con conversiones MLC de mlc-ai para WebGPU ; las descargas CPU retiradas utilizan GGUF Q4_K_M de Unsloth. Las revisiones y cuantizaciones están fijadas en `src/features/ai/models.ts`. Los pesos se descargan voluntariamente y no se incluyen en la aplicación. Los modelos retirados Qwen3 conservan sus atribuciones Apache-2.0 y las conversiones originales de mlc-ai y onnx-community.

WebLLM y XGrammar conservan sus licencias Apache-2.0. wllama 3.6.1 (MIT) se conserva únicamente por CacheManager, para gestionar descargas GGUF retiradas; su motor WASM ya no se distribuye. Las pruebas CPU históricas utilizaron llama.cpp (MIT). Workbox utiliza MIT. Los embeddings mantienen la conversión de Xenova y Transformers.js.

La evaluación CPU histórica utilizó Qwen3 1.7B (Alibaba/Qwen, Apache-2.0), en conversión GGUF Q4_K_M de Unsloth. Sus informes y descargas se conservan; el código para ejecutarlo se ha retirado. Las descargas retiradas Qwen3.5 0.8B/2B/4B CPU mantienen las atribuciones de Qwen y Unsloth.
