# Contexto de Tanukoin

Última revisión: 21 de septiembre de 2026. Referencia funcional: commit `4e88a14`, publicado y comprobado como **0.1.6**. Esta es una referencia histórica, no una afirmación de la versión vigente en futuras tareas: comprobar Git, los workflows y `version.json` cuando sea necesario.

## Propósito y decisiones

Tanukoin es una herramienta de finanzas personales en español: web estática, instalable como PWA, sin servidor de aplicación ni cuentas de usuario. Los datos y la IA permanecen en el navegador. Tras preparar sus recursos puede trabajar offline; los modelos requieren su propia descarga voluntaria.

Repositorio: <https://github.com/RASK18/Tanukoin>. Web principal: <https://disboard.es/Tanukoin/>. Licencia: AGPL-3.0-only.

El usuario quiere tratar mejoras y problemas en conversaciones separadas. `AGENTS.md` recoge las instrucciones estables; este documento proporciona el estado común. No se debe depender de disponer del historial de otra conversación.

Inspiración funcional: KashaFlow. El README indica que no se ha copiado su código. El comportamiento de actualización sigue Schedulime. El diseño toma como referencia tarjetas discretas, fondos cálidos y verdes suaves. Tanu es una ilustración raster original; los iconos son de Lucide.

Decisiones que se mantienen:

- Conexiones externas opcionales: banca, cartografía y búsqueda pública de comercios.
- Enable Banking mediante extensión opcional Manifest V3 para Chrome/Edge de escritorio; la importación de archivos no necesita extensión. Se eligió este puente por las restricciones CORS observadas en la API.
- Embeddings con Transformers.js; chat generativo con WebLLM en equipos compatibles con WebGPU. No hay sustitución por IA en la nube.
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

## Offline, privacidad y banca

La preparación inicial incluye aproximadamente 90 MB sin comprimir de interfaz, lectores y motores. Las cachés de aplicación y modelos están separadas de IndexedDB. El indicador offline se activa al preparar los recursos; no basta con haber abierto la portada.

Modelos configurados: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` para embeddings y `Qwen3-1.7B-q4f16_1-MLC` para chat. Consultar `src/features/ai/constants.ts` antes de cambiar nombres, cachés o revisiones.

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
- Chat y detección asistida por modelo real en hardware compatible con WebGPU, `shader-f16` y memoria suficiente. La validación de consultas/propuestas está probada; no se ha confirmado aquí el flujo completo de chat en ese hardware.
- Los embeddings reales se probaron anteriormente con descarga, arranque offline y búsqueda; repetir esa prueba solo si cambios relacionados lo justifican.
- No hay OCR ni compatibilidad garantizada con todos los diseños PDF. Photon y la cartografía pública dependen de disponibilidad y políticas externas.
- No existe una lista adicional de mejoras aprobadas: cada nuevo chat debe concretar su objetivo antes de ampliar alcance.

Para pruebas optativas, el README documenta `TEST_LOCAL_MODEL=1` y `TEST_LOCAL_CHAT=1`. No activar descargas grandes de modelos como parte de cada prueba rutinaria.

## Cómo mantener este contexto

Al cerrar una tarea relevante, actualizar la fecha, el comportamiento afectado y la evidencia de validación. Añadir decisiones estables a `AGENTS.md` solo si realmente cambian. Eliminar afirmaciones sustituidas y conservar los límites que sigan vigentes. No incorporar extractos privados, secretos ni transcripciones completas.

Inicio sugerido para otro chat: «Trabajamos en Tanukoin. Lee AGENTS.md y docs/contexto.md, comprueba el estado del repositorio y resuelve: [problema concreto]».
