# Atribuciones

Tanukoin: AGPL-3.0-only. Cada dependencia mantiene su licencia; sus avisos se conservan en los paquetes y recursos redistribuidos.

| Componente                                             | Licencia                         |
| ------------------------------------------------------ | -------------------------------- |
| React, React Router, Vite, Dexie, Recharts, Papa Parse | MIT                              |
| TypeScript, SheetJS CE 0.20.3, PDF.js                  | Apache-2.0                       |
| Leaflet                                                | BSD-2-Clause                     |
| Lucide                                                 | ISC                              |
| Transformers.js y WebLLM                               | Apache-2.0                       |
| ONNX Runtime                                           | MIT                              |
| MiniLM multilingüe (Xenova) y Qwen3 1.7B, 4B y 8B    | Apache-2.0                       |
| Workbox, Playwright                                    | MIT / Apache-2.0 respectivamente |
| vite-plugin-pwa, Vitest, fflate, Prettier              | MIT                              |
| Rollup, variante oficial @rollup/wasm-node           | MIT                              |

SheetJS se obtiene de su distribución oficial. Los recursos de PDF.js conservan sus avisos específicos de fuentes. Los modelos se descargan directamente desde los proveedores identificados en IA local; sus pesos no están incluidos en este repositorio.

Mapas: © OpenStreetMap contributors, ODbL y política de uso de teselas. Photon utiliza datos de OpenStreetMap. Los resultados de Wikipedia enlazan al artículo de origen y se rigen por sus condiciones de atribución.

KashaFlow se cita como inspiración funcional; no se ha incorporado su código. La ilustración raster de Tanu se generó originalmente para Tanukoin. Los SVG de interfaz proceden de Lucide y de bibliotecas de gráficos, no se dibujan manualmente.

Modelos de chat: Qwen3 de Alibaba/Qwen (Apache-2.0), con conversión ONNX de onnx-community para CPU y conversiones MLC de mlc-ai para WebGPU. Las revisiones y cuantizaciones están fijadas en `src/features/ai/models.ts`. XGrammar, incluido en WebLLM, mantiene su licencia Apache-2.0.

La opción experimental Qwen3.5 4B también procede de Alibaba/Qwen (Apache-2.0), con conversión MLC de mlc-ai. Se descarga voluntariamente y sus pesos no se incluyen en la aplicación.
