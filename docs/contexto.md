# Contexto de Tanukoin

Última revisión: 22 de septiembre de 2026. Referencia funcional: commit `4e88a14`, publicado y comprobado como **0.1.6**. Esta es una referencia histórica, no una afirmación de la versión vigente en futuras tareas: comprobar Git, los workflows y `version.json` cuando sea necesario.

## Propósito y decisiones

Tanukoin es una herramienta de finanzas personales en español: web estática, instalable como PWA, sin servidor de aplicación ni cuentas de usuario. Los datos y la IA permanecen en el navegador. Tras preparar sus recursos puede trabajar offline; los modelos requieren su propia descarga voluntaria.

Repositorio: <https://github.com/RASK18/Tanukoin>. Web principal: <https://disboard.es/Tanukoin/>. Licencia: AGPL-3.0-only.

El usuario quiere tratar mejoras y problemas en conversaciones separadas. `AGENTS.md` recoge las instrucciones estables; este documento proporciona el estado común. No se debe depender de disponer del historial de otra conversación.

Inspiración funcional: KashaFlow. El README indica que no se ha copiado su código. El comportamiento de actualización sigue Schedulime. El diseño toma como referencia tarjetas discretas, fondos cálidos y verdes suaves. Tanu es una ilustración raster original; los iconos son de Lucide.

Decisiones que se mantienen:

- Conexiones externas opcionales: banca, cartografía y búsqueda pública de comercios.
- Enable Banking mediante extensión opcional Manifest V3 para Chrome/Edge de escritorio; la importación de archivos no necesita extensión. Se eligió este puente por las restricciones CORS observadas en la API.
- Embeddings con Transformers.js; chat con Transformers.js en CPU y WebLLM en equipos compatibles con WebGPU. No hay sustitución por IA en la nube.
- Callejero detallado online; ubicaciones y asociaciones guardadas consultables offline.
- PDF con texto, sin OCR. No se promete reconocer cualquier diseño bancario.
- Búsqueda mediante Photon/OpenStreetMap y Wikipedia, con alternativa de búsqueda manual.
- EUR como moneda inicial, importes enteros y monedas separadas. No se inventan horas en movimientos que solo incluyen fecha.

## Base técnica y mapa del código

React 19, TypeScript, Vite, Dexie/IndexedDB, vite-plugin-pwa/Workbox y rutas con hash. Papa Parse para CSV, SheetJS CE para Excel y PDF.js para PDF. Gráficos con Recharts y mapa con Leaflet. Los detalles de dependencias están en `package.json` y `pnpm-lock.yaml`.

| Zona                               | Archivos principales                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Datos y esquema                    | `src/data/types.ts`, `src/data/db.ts`                                  |
| Cálculos y reglas                  | `src/lib/finance.ts`                                                   |
| Copias y restauración              | `src/lib/backup.ts`                                                    |
| Importación y revisión             | `src/features/import/ImportDialog.tsx`, `import.worker.ts`, `parse.ts` |
| Detección de columnas              | `src/features/import/detect.ts`                                        |
| Reconstrucción de certificados PDF | `src/features/import/pdf-table.ts`                                     |
| IA, chat y consultas validadas     | `src/features/ai/`                                                     |
| Ubicaciones y búsqueda pública     | `src/features/locations/`                                              |
| Banca y tutorial                   | `src/features/banking/client.ts`, `src/pages/BankPage.tsx`             |
| Puente bancario                    | `extension/`, `scripts/build-extension.mjs`                            |
| Pantallas                          | `src/pages/`                                                           |
| Apariencia y componentes           | `src/theme.css`, `src/styles.css`, `src/components/ui.tsx`             |
| PWA y versiones                    | `vite.config.ts`, `src/components/ui.tsx`                              |
| Recursos locales de lectores e IA  | `scripts/prepare-assets.mjs`                                           |
| Pruebas                            | `tests/*.test.ts`, `tests/e2e/`                                        |

El esquema IndexedDB es 1. Los campos opcionales `Movement.balance` y `ImportProfile.columns.balance` se añadieron sin cambiar índices ni inventar valores para datos antiguos. Una modificación futura del esquema que requiera migración debe ser transaccional y probarse desde datos anteriores.

## Entorno de desarrollo: Rollup en Windows

- Windows bloqueó el módulo nativo de Rollup 4.63.4 con `ERR_DLOPEN_FAILED` y un mensaje de Control de aplicaciones; el aviso superior de dependencia opcional ausente era genérico. Se sustituyó por la variante oficial `@rollup/wasm-node` de la misma versión mediante `overrides` en `pnpm-workspace.yaml`, actualizando el lockfile sin cambiar el resto de versiones. No se desactivan protecciones ni se parchea `node_modules`.
- Comprobados instalación offline con lockfile congelado, carga de Vite, arranque de `pnpm dev` y respuestas HTTP 200 de HTML/TSX, 72 pruebas unitarias y compilación con tipos/PWA. Pruebas y compilación usan permisos ampliados por el bloqueo previo del sandbox a esbuild. El servidor temporal de comprobación se cerró. Sin publicación.
- Las cinco pruebas de `tanu.spec.ts` pasaron con Edge en un perfil aislado. Chromium headless shell no pudo arrancar (`spawn UNKNOWN`) incluso con permisos ampliados; no se presenta como una prueba superada. No se descargaron ni ejecutaron modelos para este cambio de herramientas.

## Funciones existentes

- Importación CSV, XLS/XLSX y PDF con texto mediante worker, vista previa, corrección y guardado confirmado. Perfiles reutilizables, exportación CSV y copias completas JSON.
- Varias cuentas, categorías con un nivel de subcategorías, notas, edición individual/en lote y relaciones entre movimientos.
- Transferencias internas excluidas de ingresos/gastos globales; devoluciones vinculadas reducen el gasto relacionado. Reglas ordenadas por prioridad y primera coincidencia, con protección de categorías manuales.
- Resumen, gráficos, búsquedas y calendario de recurrencias semanales, mensuales y anuales. Los vencimientos inexistentes se ajustan al final del mes.
- Importación de Google Timeline: `semanticSegments`, `timelineObjects` y `Records.json`; asignaciones geográficas sugeridas o confirmadas, con corrección manual.
- Embeddings locales para categorías y búsqueda semántica. Tanu traduce preguntas a consultas limitadas y validadas; la aplicación calcula las cifras. El chat es de consulta y no modifica movimientos.
- Tutorial y conexión bancaria mediante extensión; gestión de modelos, almacenamiento y conexiones externas en Ajustes/IA local.

La presencia de una función en código no sustituye las validaciones reales pendientes indicadas más abajo.

## Navegación y distribución

- La marca (Tanu y nombre Tanukoin) encabeza la barra lateral. Se elimina la topbar y su buscador; la búsqueda sigue disponible en Movimientos.
- El pie de la barra lateral reúne el mensaje «Datos solo en este navegador / Sin sincronización en la nube», el estado de conexión y la versión. Sustituye la ilustración repetida y los avisos redundantes de la cabecera.
- En móvil, un botón independiente abre y cierra la barra lateral; el menú cerrado no recibe foco y la barra permite desplazamiento en pantallas bajas.
- Validación: compilación con comprobación de tipos y las dos pruebas existentes de navegador de navegación móvil y diseño de escritorio, ambas superadas. Captura de escritorio revisada visualmente. Cambio local, sin publicación.

## Ayudas de bienvenida del resumen

- «Empieza por tus movimientos» solo aparece sin movimientos en todo el historial, independientemente del mes o moneda seleccionados. «Conoce a Tanu» aparece mientras el modelo de chat no esté preparado; preparar únicamente embeddings no la oculta. Se consulta el estado local sin iniciar descargas.
- Cada tarjeta permite cerrarse con una × accesible. Las preferencias opcionales `hideImportWelcome` y `hideTanuWelcome` se guardan en IndexedDB y se conservan en las copias de seguridad, sin migrar el esquema. Ajustes → Preferencias permite restablecer los cierres; las condiciones automáticas siguen aplicándose. Si se eliminan todos los movimientos o se retira el modelo, la ayuda correspondiente puede reaparecer salvo que se haya cerrado manualmente.
- Una sola tarjeta ocupa el ancho disponible y la de Tanu se compacta en escritorio. Si no queda ninguna, se elimina el bloque completo sin dejar espacio vacío.
- Validación: compilación con tipos, 28 pruebas unitarias y tres pruebas existentes de navegador (copias, móvil y escritorio). Comprobación adicional en Chromium de cierres independientes, persistencia al recargar, restablecimiento, estados de chat pendiente/preparado, embeddings y movimientos fuera del período/moneda. Capturas de escritorio y móvil revisadas. Estados de modelos simulados, sin descarga ni ejecución de IA real. Sin publicación.

## Importación de historiales grandes en el mapa

- La acumulación de ubicaciones devueltas por el worker se realiza iterando sobre un `Map`, sin expandir el historial como argumentos de `push`, lo que provocaba `RangeError: Maximum call stack size exceeded` con archivos grandes. Los identificadores guardados se consultan mediante un `Set` para evitar comparar cada punto con todo el historial existente.
- Se mantiene la eliminación de duplicados entre archivos y frente a ubicaciones guardadas, la revisión antes de confirmar y el guardado transaccional. El límite sigue siendo 100 MB por archivo.
- Validación: error reproducido y lectura/acumulación corregidas contrastadas localmente con un historial privado, sin incorporar datos ni rutas al repositorio. Compilación con tipos y 28 pruebas unitarias superadas. Una regresión en Chromium con 225.000 ubicaciones ficticias verifica archivos solapados, revisión sin guardar, descarte, confirmación, persistencia tras recargar y reimportación sin duplicados. El archivo privado no se ha guardado en el navegador de pruebas. Cambio local, sin publicación.

## Cambios recientes de importación

### Saldo en Tus movimientos

- La tabla muestra «Saldo» después de «Importe»: el valor `Movement.balance` procedente del archivo importado, correspondiente a la cuenta de ese movimiento y formateado en su moneda. No se recalcula al filtrar, ordenar o editar el importe, ni se mezcla entre cuentas.
- Se muestran los valores cero y negativos; los movimientos sin saldo importado muestran «—» con etiqueta accesible «Saldo no disponible». No se reconstruyen saldos históricos.
- Validación: compilación con comprobación de tipos y una regresión de navegador que importa saldos positivos, cero, negativos y ausentes, verifica filtros, ordenación y persistencia tras recargar, y comprueba que la página no desborda en móvil. Captura de escritorio revisada con datos ficticios.

### Paso de progreso al confirmar la importación

- Tras confirmar en la revisión, el paso **3. Importando** sustituye la tabla por el estado de la operación. Muestra preparación, reglas, IA local cuando está preparada y guardado; las fases medibles indican movimientos procesados y pendientes de esa fase. No se estima un tiempo restante ni un porcentaje global ficticio.
- Las reglas se aplican por lotes cediendo tiempo al navegador. La IA informa del avance de los vectores de movimientos cada lote de 16 y cuenta los ya disponibles en caché; la preparación de categorías y ejemplos muestra espera indeterminada.
- El guardado usa lotes de 250 dentro de una única transacción IndexedDB, manteniendo la comparación de identificadores solo frente a movimientos previamente guardados. Un error revierte toda la importación y devuelve a la revisión conservando la selección y mostrando un aviso; se bloquean cierres y confirmaciones repetidas durante el proceso.
- El nuevo paso recibe el foco y anuncia su estado de forma accesible. Los indicadores de pasos se ajustan a pantallas pequeñas.
- Validación: tipos, compilación, 27 pruebas unitarias (incluido progreso de IA con worker simulado y caché) y 12 pruebas de navegador, incluidas regresiones con 1.200 movimientos, progreso, fallo tras un lote, reversión completa y reintento. La IA real no se ha ejecutado para este cambio.

### PDF y múltiples páginas — referencia 0.1.5

El certificado bancario con cabeceras `FE.ANOTAC / IMPORTE / SALDO / CONCEPTO` coloca fecha e importes al final de conceptos que pueden ocupar varias líneas. Las páginas siguientes no repiten la cabecera.

`pdf-table.ts` reconoce ese diseño y reconstruye las filas por posiciones. Produce columnas normalizadas `Fecha / Concepto / Importe / Saldo`, mantiene la primera fila de las páginas sin cabecera y excluye cabeceras/pies del documento. Se seleccionan todas las páginas de ese formato reconocido. Otros diseños conservan el lector genérico y la configuración manual.

Se contrastó un documento privado completo localmente y se verificó el flujo de navegador sin solicitudes externas. El documento, sus datos y sus rutas personales no forman parte del repositorio. Las regresiones utilizan ejemplos ficticios.

### Flujo simplificado y saldo — referencia 0.1.6

- La caja de archivo acepta arrastrar/soltar y selección mediante clic o teclado. Tras elegirlo se vuelve compacta.
- Cuenta de destino y vista previa quedan visibles. Hoja/página, perfiles, cabecera, formatos, separador, selección de páginas y columnas están dentro de «Opciones avanzadas».
- `detect.ts` reconoce cabeceras, hoja, fila, fecha y separador decimal. Para formatos no reconocidos, si el modelo de chat ya está preparado, solicita una propuesta local y valida índices, tipos, correspondencias conocidas y filas de muestra. No descarga modelos automáticamente. Si falla, se permite corregir manualmente.
- El saldo se conserva como entero opcional, se muestra en la revisión y se incluye en CSV y copias JSON. No sustituye al saldo de cuenta ni se suma como ingreso/gasto.
- No se comparan filas entre sí dentro de una importación, tampoco entre páginas. Las operaciones repetidas del mismo archivo se conservan.
- `duplicateChecker` compara con movimientos ya guardados de la misma cuenta y moneda, usando fecha, importe, concepto normalizado y saldo. Una coincidencia completa por contenido comienza desmarcada y puede revisarse. Un saldo distinto significa un movimiento distinto.
- Si falta saldo en cualquiera de las partes, una coincidencia de los demás campos aparece como «Revisar coincidencia: falta saldo» y permanece seleccionada. Esto afecta a importaciones realizadas antes de guardar saldos; el usuario debe revisar antes de reimportar.
- Los identificadores bancarios estables coincidentes con registros ya guardados siguen considerándose duplicados exactos. No se descartan filas porque compartan identificador solamente entre sí en el archivo nuevo.

## Tanu: arquitectura conversacional y modelos locales

- IA local comienza con la selección de modelos después del título; se retiró el recuadro introductorio «Dos formas de ayudarte. La misma privacidad» y sus estilos exclusivos. Validado con tipos, compilación y la prueba existente de diseño móvil/teclado en Edge; sin publicación.
- Sin un modelo vigente preparado, Tanu muestra únicamente la guía breve y el enlace a IA local. No hay reconocedores de frases ni consultas sin modelo. Estados: Sin preparar, Preparando, Listo y Necesita revisión.
- Catálogo en `models.ts`: Ligero Qwen3 1.7B ONNX q8/WASM; Equilibrado Qwen3 4B MLC q4f16_1/WebGPU; Avanzado Qwen3 8B MLC q4f16_1/WebGPU, destinado a GPU física de 8 GB y contexto total de 4096 tokens. Revisiones fijadas. RAM del equipo y VRAM se distinguen en la interfaz.
- Experimento local autorizado para comparar calidad y consumo: cuarta opción temporal **Qwen3.5 · prueba**, Qwen3.5 4B MLC q4f16_1, contexto 4096, revisión `44b42469f9e192814bfd90440e3b377d89ba7a13`, descarga de pesos 2,37 GB. Usa la biblioteca del catálogo instalado de WebLLM, con `max_history_size: 1` para los estados recurrentes del motor; el historial conversacional sigue llegando explícitamente en los mensajes. Instalación y caché independientes; no sustituye ni recomienda automáticamente esta opción, y conserva los tres modelos anteriores. La estimación de 3,9 GB de WebLLM no garantiza el consumo total ni la fluidez. No se ha añadido reparto de capas entre CPU y GPU ni servicios externos.
- IA local muestra un perfil con núcleos lógicos (`hardwareConcurrency`), RAM aproximada (`deviceMemory`), disponibilidad real de un adaptador WebGPU y tipo de dispositivo orientativo (UA Client Hints y agente de usuario, sin deducirlo del ancho de pantalla). Los valores ausentes aparecen como no disponibles; el navegador puede limitar estas señales por privacidad. Se retiran de esta pantalla la estimación de almacenamiento y sus avisos: la cuota artificial de Brave no condiciona la recomendación.
- Recomendación mediante WASM, WebGPU, shader-f16, límites de búfer y el perfil anterior. Sin GPU compatible o RAM suficiente/conocida se recomienda Ligero; también, como criterio conservador, en móvil/tableta o con menos de cuatro núcleos lógicos indicados. En los demás casos, Equilibrado con al menos 8 GB de RAM aproximada. Estas heurísticas no impiden elegir otro modelo compatible. Avanzado se recomienda tras carga y generación verificadas localmente en la GPU detectada. Nunca se descarga ni cambia de modelo automáticamente.
- Validación del cambio de perfil: tipos, compilación, 72 pruebas unitarias y las 5 pruebas de navegador de `tanu.spec.ts` superadas. Regresión con cuota ficticia de 2 GiB, perfil de escritorio, móvil y datos ausentes; capturas revisadas en ambos tamaños. Hardware simulado, sin descargar ni ejecutar modelos para este ajuste. El sandbox bloqueó esbuild (`spawn EPERM`); pruebas y compilación completadas con permisos ampliados. No sustituye las verificaciones reales pendientes de los modelos indicadas más abajo.
- Instalación y comprobación por variante en IndexedDB. El registro chat contiene la selección; cada variante su estado y recursos. La preparación reinicia el worker y verifica generación sin red antes de activar. Fallar al instalar otro conserva la selección vigente anterior. Cambiar libera el worker anterior y conserva sus archivos. Cancelar invalida respuestas tardías.
- Qwen3 1.7B GPU queda retirado e inutilizable también para la importación asistida. La reconciliación elimina su selección y conserva registro y archivos; IA local ofrece Desinstalar. Se eliminan únicamente recursos de esa variante y bibliotecas no compartidas. CPU no hereda su estado. No se cambia el esquema de la base ni se borran datos.
- `assistant.ts` coordina turnos fuera de React: primera inferencia decide conversación, ayuda, consulta o aclaración. Ayuda recibe apartados de una guía local revisada. Las consultas reciben una segunda inferencia especializada; `query-intent.ts` separa borrador y consulta normalizada. `queries.ts` calcula resultados y referencias. Máximo tres inferencias y un único intento corrector. También se revisa la contradicción entre límites monetarios y recorte porcentual antes de pedir un porcentaje; si realmente falta, se conserva el borrador.
- Conversación: la primera inferencia solo decide `reply`; una segunda redacta texto libre con temperatura 0,7 y top-p 0,8. Las decisiones, la ayuda documentada y las consultas conservan temperatura cero y validación estructurada. El borrador pendiente se conserva al conversar. Los prompts distinguen conceptos financieros con ejemplos ficticios de instrucciones sobre Tanukoin; no hay reconocedores de frases. Sigue siendo necesario comprobar la calidad real, especialmente seguimientos que necesiten detalles de la guía más allá del resumen general de funciones.
- Identidad y brevedad: `help.ts` mantiene una descripción confirmada compartida por decisión, conversación y ayuda. Tanukoin organiza cuentas bancarias, ingresos y gastos; no tiene criptomonedas, compraventa, cotizaciones ni monederos de inversión. El prompt enumera las funciones reales y declara no disponibles las capacidades fuera de ese alcance; enumerar las funciones inexistentes hacía que el modelo las mencionara espontáneamente, aunque fuera para negarlas. La conversación recibe además el resumen de funciones con nombres exactos de pantallas y no debe tomar sus respuestas anteriores como prueba de capacidades. Se solicita una a tres frases, hasta 60 palabras por defecto, o hasta 120 al pedir detalles. Se conservan temperatura 0,7, top-p 0,8 y los límites de generación; no se truncan respuestas ni se introducen filtros de palabras en el producto. `TEST_CHAT_STYLE=1` añade una regresión real optativa de siete conversaciones con ocho respuestas, incluida corrección de una premisa falsa y un seguimiento breve, sin alterar los 50 escenarios existentes.
- Validación de identidad y brevedad con Qwen3.5 real: entrada `evaluation-BOV1u4vH.js`, informe `style-balanced-trial.json`. Ocho respuestas revisadas, de 8 a 41 palabras, sin menciones espontáneas a criptomonedas, negando las funciones inexistentes solicitadas y usando «Resumen» en el seguimiento. Los casos 03, 07, 24 y 33, el reinicio offline y la recuperación tras cancelar pasaron. La última ejecución de Playwright marcó únicamente el saludo de 23 palabras frente a un umbral especial de 20; la aserción se alineó con las 60 palabras del prompt y se reevaluaron las ocho respuestas capturadas con éxito, sin repetir las generaciones por ese cambio de test. Tipos, 74 pruebas unitarias y compilación normal comprobados; CPU y 8B no se repitieron para este ajuste. La prueba real esperó a liberar la VRAM ocupada por otra pestaña; se conservan datos y descargas. La muestra no garantiza ausencia de errores en cualquier conversación.
- Hasta tres intercambios recientes, última consulta válida y borrador pendiente. El modelo decide si continúa o empieza otra consulta. Fechas, unidades monetarias, cuentas y categorías se resuelven en código. Un mes sin año usa el año contextual en seguimientos y el actual en preguntas nuevas, también tras aclarar parámetros.
- Se conservan búsquedas por concepto/comercio/notas/categorías y vocabulario de sinónimos; totales, comparación, mínimos, máximos, medias y medianas simples/acotadas/truncadas. Importes enteros, monedas separadas, exclusión de transferencias y devoluciones en estadísticas individuales, totales netos. Límites inclusivos, recorte simétrico por extremo y redondeo único en la unidad mínima de cada moneda. No se modifican movimientos.
- `chat-runtime.ts` serializa generaciones del chat y del adaptador de importación; workers CPU/GPU. WebLLM genera JSON con esquema; CPU solicita JSON y lo valida. El esquema XGrammar usa campos superiores obligatorios con null para los que no se solicitan, evitando omisiones por su orden de generación. CPU recibe los campos permitidos y las instrucciones de formato, no el esquema completo que tendía a copiar. Se normalizan prefijos vacíos de pensamiento y bloques JSON completos, rechazando respuestas vacías/truncadas y parámetros inválidos.
- CPU desactiva optimizaciones y preempaquetado que duplican pesos; prefill por bloques para limitar las asignaciones de logits dentro del límite WASM. No se elimina contenido de la pregunta para ahorrar memoria. Solo se retiran intercambios antiguos al ajustar el contexto. Se reutilizan como máximo dos prefijos exactos de instrucciones de hasta 768 tokens; cancelar o cambiar de modelo los libera.
- Evaluación reproducible: `tests/ai-corpus.ts` tiene 50 escenarios ficticios, 20 reservados. `tests/e2e/local-chat.spec.ts` usa Edge headless con perfiles propios y dos vueltas por variante; exige todas las regresiones críticas y 95 % en cada vuelta. La entrada `tests/browser/ai-harness.html` solo se compila con TANUKOIN_AI_EVAL=1. No forma parte de una compilación normal.
- Comparación corta del experimento: `TEST_CHAT_COMPARE=1`, `TEST_CHAT_SMOKE=1` y casos `03,07,10,16,24,33,45,50`, con límite de diez minutos por variante. Registra cuatro turnos de conversación libre y muestras opcionales de `nvidia-smi`, separando preparación, conversación, casos y recuperación. Son cifras de **toda la GPU**, no memoria exclusiva del modelo; Edge headless no acredita fluidez en Brave. `comparison-*.json` conserva los resultados sin sobrescribir los informes históricos completos. Se corrigió un falso negativo del caso 33: «en este navegador» expresa correctamente el procesamiento local, pero no figuraba entre las formulaciones admitidas.
- Qwen3.5, comparación con entrada `evaluation-B6Popfz0.js`: 8/8 casos correctos, preparación, reinicio offline y recuperación tras cancelar superados en RTX 3060 Ti de 8192 MiB. **No implica aceptación general ni superioridad conversacional**: en los cuatro turnos libres inventó una regla para redondear gastos y dio un ejemplo poco coherente de gasto fijo; el seguimiento se derivó a conversación sin guía. GPU total: base 2166 MiB, conversación 6341–6397 MiB, consultas hasta 7212 MiB, con consumo creciente durante esta sesión corta. Requiere más evaluación antes de sustituir Equilibrado. No se ha repetido la batería completa de CPU ni de los otros modelos para el cambio de conversación.
- Avanzado, misma entrada y comparación corta: 7/8 casos correctos; falla el crítico 24. Tras pedir el máximo de septiembre y luego agosto, produce `comparison` en vez de cambiar el período; el intento corrector transforma la operación en comparación. Preparación, reinicio offline y recuperación tras cancelar sí pasan. GPU total: base 2186 MiB, conversación 7713–7757 MiB y consultas 7643–7751 MiB. Los cuatro turnos libres también tienen imprecisiones. No se repitió la prueba prolongada de contexto en esta comparación. Los resultados actuales no justifican promover el nuevo modelo ni declarar resuelta la calidad o la fluidez del escritorio.
- Validación de la opción experimental y generación conversacional: 74 pruebas unitarias, tipos, compilación normal y las 5 pruebas de interfaz de Tanu en Edge superadas. La compilación final excluye el harness de evaluación. Se necesitaron permisos ampliados para esbuild y el navegador; las pruebas reales descritas se pudieron ejecutar. Cambios solo locales, sin publicación. La fluidez en Brave y la calidad fuera de esta muestra siguen pendientes.
- Validación general: tipos, compilación y 72 pruebas unitarias superadas. Las 18 pruebas de navegador generales corresponden a una revisión anterior; tras los últimos ajustes pasaron las 5 de Tanu en Edge y, después de retirar el recuadro, la prueba específica de móvil/teclado. Las pruebas optativas de modelos se ejecutan por separado. El sandbox bloquea esbuild; se usan permisos ampliados. Chromium headless shell presentó además `spawn UNKNOWN`, por lo que se usa Edge instalado.
- Informes reales revisados el 22/09, guardados en `.cache/tanu-tests/reports/`: `light.json` y `balanced.json` completaron 50 escenarios por dos vueltas con la entrada `evaluation-D8cz6n_f.js`. Ligero: 62 % en ambas vueltas, no aceptado, con 11 escenarios críticos fallidos por vuelta (06, 07, 09, 14, 15, 23, 24, 26, 27, 28, 30). Equilibrado: 94 % en ambas vueltas, todos los críticos correctos, no aceptado; falla 33 (ayuda de privacidad), 45 (confunde consulta local con búsqueda pública) y 50 (busca literalmente «cargos»). Revisar las generaciones completas del informe antes de cambiar prompts.
- `advanced.json`: 96 % en ambas vueltas y todos los críticos correctos, carga y reinicio offline, recuperación tras cancelar y presión de contexto con 3630 tokens de entrada en RTX 3060 Ti física de 8192 MiB. Su `accepted: true` corresponde a la entrada anterior `evaluation-BVSpUFre.js`, no a la versión final del prompt. Fallaron 47 (hereda el año en una pregunta nueva) y 50 («cargos» literal). Revalidar Avanzado con la versión final, manteniendo el requisito de GPU de 8 GB. Los tres informes registran preparación, reinicio offline y recuperación tras cancelar; eso no acredita la calidad de las respuestas. **La entrega no está aceptada mientras los tres niveles no superen toda la batería y la prueba prolongada de 8 GB.** Sin publicación.

## Offline, privacidad y banca

La preparación inicial incluye aproximadamente 90 MB sin comprimir de interfaz, lectores y motores. Las cachés de aplicación y modelos están separadas de IndexedDB. El indicador offline se activa al preparar los recursos; no basta con haber abierto la portada.

Embeddings: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, con constantes en `src/features/ai/constants.ts`. Las tres variantes del chat y la opción temporal de prueba, con sus revisiones, están en `src/features/ai/models.ts`.

Mapas, búsqueda y banca empiezan desactivados. Las búsquedas públicas muestran el nombre comercial y localidad a enviar; no deben incluir importes, cuentas, conceptos completos ni el historial de ubicaciones. No hay analítica ni envío de errores personales.

El PEM se importa con Web Crypto como clave no exportable y permanece en memoria. Se transmiten identificador, tokens firmados y solicitudes necesarias al proveedor, nunca la clave privada. La extensión restringe origen, ruta y operaciones; no permite pagos ni URLs arbitrarias. Su ZIP y actualización son independientes de la PWA.

Los datos no están cifrados en el perfil del navegador. Borrar el almacenamiento los elimina; las copias son necesarias. Las copias excluyen credenciales y cachés de modelos; restaurarlas desactiva conexiones externas.

## Despliegue y direcciones

GitHub Pages se despliega desde `.github/workflows/deploy-pages.yml` al publicar en `main`, tras tipos, pruebas, compilación y Playwright. Usa historial completo y `SITE_ORIGIN=https://disboard.es`. Las etiquetas `v*` publican la extensión según el workflow de releases.

`vite.config.ts` calcula `major.minor.númeroDeCommits`, con respaldo al patch del paquete y posibles variables `APP_VERSION` y `APP_UPDATED_AT`. `package.json` no refleja necesariamente la versión publicada. Se genera `version.json` con `version` y `updatedAt`.

La aplicación comprueba actualizaciones al abrir, reconectar o recuperar foco, limitándolas a una cada 15 minutos. «Actualizar ahora» espera al service worker y evita recargar con operaciones o ediciones pendientes. Debe conservar datos y modelos.

La ruta canónica es **`/Tanukoin/`**, respetando mayúsculas. **`/tanukoin/`** redirige a ella conservando búsqueda y hash. Ese alias se implementó en `tanukoin/index.html` de **otro repositorio, `RASK18/RASK18.github.io`**, no en este. No cambies el `base` de Vite para reparar el alias. El dominio procede del sitio de usuario de GitHub Pages.

Cambiar origen o perfil del navegador cambia el espacio de almacenamiento. No lo confundas con pérdida de datos por una actualización.

## Validación registrada y límites pendientes

En el cambio funcional 0.1.6 pasaron **26 pruebas unitarias y 10 pruebas de navegador**, además de tipos, compilación y el workflow de publicación. Dos pruebas opcionales de modelos no se ejecutan en la suite normal. Estos números son una referencia de esa revisión, no sustituyen ejecutar las pruebas del siguiente cambio.

Se probaron importación de archivos, arrastre, columnas desordenadas, saldos, duplicados frente a guardados, PDF de varias páginas, copias, navegación móvil/escritorio y actualización conservando datos/cachés. El PDF privado se importó y exportó localmente con todos sus movimientos y saldos, sin tráfico externo.

Pendiente de validación real o limitaciones conocidas:

- Autorización bancaria completa con credenciales de prueba/personales, cancelación y caducidad en sandbox o banco real. Las pruebas del puente no equivalen a esta validación.
- Detección de importaciones asistida por modelo real y preguntas de chat fuera de los casos comprobados. La nueva arquitectura se evalúa en perfiles aislados de Edge headless con modelos CPU y GPU reales. La aceptación depende de completar la batería por variante indicada en la sección de IA; las pruebas parciales no la acreditan.
- Los embeddings reales se probaron anteriormente con descarga, arranque offline y búsqueda; repetir esa prueba solo si cambios relacionados lo justifican.
- No hay OCR ni compatibilidad garantizada con todos los diseños PDF. Photon y la cartografía pública dependen de disponibilidad y políticas externas.
- No existe una lista adicional de mejoras aprobadas: cada nuevo chat debe concretar su objetivo antes de ampliar alcance.

Para pruebas optativas, el README documenta `TEST_LOCAL_MODEL=1` (embeddings) y `TEST_CHAT_VARIANT` (chat real por variante). No activar descargas grandes de modelos como parte de cada prueba rutinaria.

## Cómo mantener este contexto

Al cerrar una tarea relevante, actualizar la fecha, el comportamiento afectado y la evidencia de validación. Añadir decisiones estables a `AGENTS.md` solo si realmente cambian. Eliminar afirmaciones sustituidas y conservar los límites que sigan vigentes. No incorporar extractos privados, secretos ni transcripciones completas.

Inicio sugerido para otro chat: «Trabajamos en Tanukoin. Lee AGENTS.md y docs/contexto.md, comprueba el estado del repositorio y resuelve: [problema concreto]».
