# Evaluación local de modelos de Tanu

Fecha: 22 de septiembre de 2026. Trabajo local, sin publicación.

## Condiciones

- Equipo de referencia CPU acordado: AMD Ryzen 5 5600X, 6 núcleos físicos y 12 hilos lógicos; el navegador comunica 32 GB de RAM. GPU: RTX 3060 Ti de 8 GB.
- Edge, perfiles aislados, datos ficticios. Se conserva la caché de cada perfil; no se utiliza el perfil personal del usuario.
- CPU: wllama 3.6.1, GGUF Q4_K_M, sin WebGPU. GPU: WebLLM, MLC q4f16_1. Contexto total 4096, pensamiento desactivado y límites habituales de Tanu.
- La preparación se mide por separado. El tiempo de respuesta incluye las inferencias de decisión y respuesta/intención. Un saludo directo con unas decenas de tokens no representa el coste de las instrucciones completas de Tanu.
- Umbral CPU acordado: 100 segundos por respuesta completa después de preparar. La comparación definitiva de CPU se realiza sin otras evaluaciones de modelos concurrentes. No es una garantía universal para cualquier pregunta o equipo.
- Calidad: 50 escenarios, dos vueltas, todos los críticos y al menos 95 % en cada vuelta. No se rebajan los umbrales por fallos ni se acredita calidad a partir de la comprobación JSON de preparación.

## CPU con las instrucciones completas (histórico)

| Variante     | Hilos | Saludo de Tanu |             Consulta financiera | Observación                                                               |
| ------------ | ----: | -------------: | ------------------------------: | ------------------------------------------------------------------------- |
| Qwen3.5 4B   |     8 |        228,6 s | No medida en esta configuración | Supera 100 s incluso en conversación                                      |
| Qwen3.5 2B   |     6 |        100,5 s |                       No medida | Supera 100 s en conversación                                              |
| Qwen3.5 2B   |     8 |         89,9 s |                         129,9 s | Repetición sin evaluación concurrente; consulta correcta, demasiado lenta |
| Qwen3.5 0.8B |     4 |         50,2 s |                          75,2 s | Cumple 100 s en ambas pruebas; consulta correcta                          |
| Qwen3.5 0.8B |     6 |         47,9 s |                          69,3 s | Cumple 90 s en ambas pruebas; consulta correcta                           |
| Qwen3.5 0.8B |     8 |         37,3 s |                          56,0 s | Cumple también 60 s en ambas pruebas; consulta correcta                   |
| Qwen3 1.7B   |     6 |         93,6 s |                         122,7 s | Consulta correcta; supera 100 s en consultas                              |
| Qwen3 1.7B   |     8 |         82,6 s |                         107,9 s | Consulta correcta; supera 100 s en consultas                              |

Los primeros informes calculaban la suma de tiempos de inferencia; el benchmark actualizado mide también el tiempo de pared del turno completo. Las cifras de 4B y 2B anteriores corresponden a la suma de inferencias. La preparación no está incluida.

0.8B supera además preparación, reinicio offline, cancelación y recuperación. Son comprobaciones funcionales parciales, no una batería de calidad completa. Informe de velocidad: `cpu-0.8b-integrated-threads-6-8-reference-idle.json`. Fue la última opción CPU evaluada; finalmente también se retira por calidad, conservando descargas e informes.

En la comprobación adicional de calidad de 0.8B fallaron los cuatro casos seleccionados (09, 10, 23 y 49): menor gasto, media, seguimiento de máximo y exclusión de alquiler. Tres son críticos. El resultado 0/4 describe ese subconjunto, no una tasa global. El saludo y la consulta de mayor gasto sí habían pasado. No se completan las dos vueltas de 50 casos porque ya falla el requisito de todos los críticos; tampoco se acredita importación asistida ni contexto prolongado en CPU. Informe: `cpu-0.8b-critical-check.json`. La rapidez medida no supone validación de calidad.

1.7B también supera esas comprobaciones funcionales básicas, pero no cumple 100 s en la consulta medida con 6 ni 8 hilos. Informe: `cpu-qwen3-1.7b-integrated-threads-6-8-reference-idle.json`. Ampliar de 90 a 100 segundos no cambia qué modelos cumplen ambos turnos medidos: solo 0.8B lo hace entre los cuatro modelos CPU comparados.

La comprobación adicional con 4 hilos también cumple (`cpu-0.8b-integrated-threads-4-reference-idle.json`). El selector evaluado ofrecía 4, 6 y 8, limitados por el equipo; Automático seleccionaba 6 en esta máquina. El selector y la ejecución CPU ya están retirados. Las demás cantidades no se ofrecen: no se han acreditado con el flujo completo, lo que no implica haber medido un fallo en cada una. Si faltan aislamiento o hilos suficientes se bloquea la preparación; no se ofrece un hilo como alternativa sin validar.

En 4B, el mismo saludo **directo al motor** tardó 57,2 s con 1 hilo (primer token 36,7 s), 14,3 s con 6 hilos (primer token 8,9 s) y 13,4 s con 8. Esta diferencia confirma el efecto del multihilo, pero no acredita velocidad en el flujo completo.

La integración CPU evaluada conservaba el contrato textual breve del coordinador anterior y pasaba el JSON Schema completo a la API nativa de wllama. Los informes anteriores a esa corrección, con el esquema duplicado en el texto, se conservan para trazabilidad y no se usan para describir el comportamiento final.

## Intento de corrección de calidad de CPU 0.8B

Se compararon cuatro propuestas sin cambiar pesos, cuantización, contexto 4096, pensamiento desactivado ni criterios de aceptación. Los casos 09/10/23/49 comprueban mínimo, media, conservación de operación/año y exclusión de un concepto. Son un diagnóstico dirigido a errores conocidos, no una evaluación independiente ni una tasa global de acierto.

| Propuesta                                                                          | Hilos | Resultado del diagnóstico                                                             |
| ---------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------- |
| Instrucciones breves en español; extracción sin repetir las respuestas anteriores  |     4 | 0/4; inventa filtros y no corrige JSON semánticamente inválido                        |
| Lo anterior con campos JSON opcionales y conservación de filtros desde el borrador |     8 | 2/4; mínimo y media correctos en unos 30–31 s, pero falla fecha/operación y exclusión |
| Más ejemplos de fechas, límites y exclusiones; ampliación a cuentas y categorías   |     8 | 1/7; aparecen regresiones de mes, se omite la cuenta y falla la categoría             |
| Instrucciones originales, campos opcionales y contexto del borrador                |     8 | 1/4; fallos críticos 09 y 23, y fallo de exclusión 49                                 |

Los informes son `cpu-0.8b-quality-spanish-v1.json`, `cpu-0.8b-quality-sparse-v2.json`, `cpu-0.8b-quality-examples-v3.json` y `cpu-0.8b-quality-original-sparse-v4.json`, conservados en `.cache/tanu-tests/reports/`. Se guardan también los últimos prototipos en `.cache/tanu-tests/quality-attempts/`. El harness registró tiempos completos por turno terminado y permitía fijar los hilos; esa opción desaparece con el motor CPU.

La mejor mejora parcial no alcanza la calidad exigida: una exclusión llega a convertirse en búsqueda del concepto excluido; otras variantes cambian el mes o pierden una cuenta solicitada. No se prosigue a 50 escenarios por dos vueltas porque ya incumplen casos críticos. No se acredita rendimiento universal a partir de los turnos correctos ni se rebajan umbrales.

Los cambios experimentales de instrucciones, esquema y coordinador se descartaron. El usuario decidió retirar toda la opción CPU: ya no hay worker, selector de hilos ni posibilidad de ejecutar estos modelos. Solo se mantienen metadatos y CacheManager para desinstalar los archivos cuando el usuario lo solicite, sin afectar a GPU. No se borran descargas, datos ni informes históricos.

## Calidad y funcionamiento de GPU

Repetición completa tras retirar CPU: 100 escenarios por variante, ejecutadas por separado en la RTX 3060 Ti de 8 GB. Informes `gpu-2b-gpu-only.json` y `gpu-4b-gpu-only.json`, sin sobrescribir las evaluaciones anteriores. Los porcentajes se mantienen en ambas repeticiones.

| Variante   | Vuelta 1     | Vuelta 2     | Criterio de calidad                 |
| ---------- | ------------ | ------------ | ----------------------------------- |
| Qwen3.5 2B | 22/50 · 44 % | 22/50 · 44 % | No cumple                           |
| Qwen3.5 4B | 47/50 · 94 % | 47/50 · 94 % | No cumple                           |
| Qwen3.5 9B | No ejecutada | No ejecutada | Experimental; falta equipo de 12 GB |

4B falla en los casos 09 (crítico: mes siguiente en lugar del actual), 47 (hereda el año de la pregunta anterior) y 49 (pide una aclaración innecesaria). Sí supera carga, reinicio offline, cancelación y recuperación, importación asistida con JSON, contexto largo y conversación prolongada. También supera el cambio 4B → 2B → 4B sin conexión, verificando la activación de cada modelo y conservando ambas instalaciones. No se registran errores no controlados del navegador. Esto acredita funcionamiento técnico, no el umbral de calidad.

2B confunde numerosas consultas con peticiones de ayuda sobre la web y también falla fechas, operaciones y filtros. Supera carga, reinicio offline y cancelación/recuperación. La importación asistida devuelve una respuesta truncada y la aplicación la rechaza. La repetición completa tras retirar CPU vuelve a fallar en el tercer turno de conversación prolongada. Informe actual: `gpu-2b-gpu-only.json` (100 casos; 17 críticos fallidos por vuelta, sin errores no controlados del navegador). Se conserva también la comprobación histórica `gpu-2b-context-check.json`.

Para 9B se han comprobado catálogo, interfaz y disponibilidad de configuración/biblioteca fijadas. No se han descargado sus pesos ni se ha intentado ejecutarlo en la GPU de 8 GB.

## Comprobaciones de implementación

Tipos, 90 pruebas unitarias, compilaciones de evaluación y normal, y 28 pruebas generales de navegador en Edge superadas. La suite general omite sus tres pruebas opcionales de modelos: GPU 2B/4B se ejecutaron por separado con los resultados anteriores; embeddings real no se repite para este cambio. La compilación normal final no incluye harness, página de prueba, worker CPU ni WASM de wllama.

Se verifican avisos y bloqueo con WebGPU ausente, adaptador nulo, acceso rechazado y falta de shader-f16; son condiciones simuladas en Edge, no una prueba en Brave. También migración de CPU retirado, independencia de GPU, teclado/móvil, reinicio offline, banca ficticia, mapas/búsquedas con CORS simulado, extensión, descargas y actualización con cambios pendientes. Se conserva el trabajo local sin push ni despliegue.

## Reproducción y límites

Los comandos de compilación y evaluación GPU están en el README. `tests/e2e/local-chat.spec.ts` evalúa los escenarios y el funcionamiento integrado. Las pruebas de migración/desinstalación de CPU se mantienen; las pruebas que ejecutaban el motor CPU se retiran con él.

Los informes completos se conservan localmente en `.cache/tanu-tests/reports/`. Las pruebas parciales no acreditan el 95 % ni todos los casos críticos. El catálogo definitivo es exclusivamente GPU 2B/4B/9B. Ninguna variante ejecutada satisface aún todos los criterios de calidad; 9B queda pendiente por falta de hardware. No se publica este trabajo.
