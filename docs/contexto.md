# Contexto de Tanukoin

Última revisión: 23 de septiembre de 2026. Referencia funcional: commit `4e88a14`, publicado y comprobado como **0.1.6**. Esta es una referencia histórica, no una afirmación de la versión vigente en futuras tareas: comprobar Git, los workflows y `version.json` cuando sea necesario.

## Propósito y decisiones

Tanukoin es una herramienta de finanzas personales en español: web estática, instalable como PWA, sin servidor de aplicación ni cuentas de usuario. Los datos y la IA permanecen en el navegador. Tras preparar sus recursos puede trabajar offline; los modelos requieren su propia descarga voluntaria.

Repositorio: <https://github.com/RASK18/Tanukoin>. Web principal: <https://disboard.es/Tanukoin/>. Licencia: AGPL-3.0-only.

El usuario quiere tratar mejoras y problemas en conversaciones separadas. `AGENTS.md` recoge las instrucciones estables; este documento proporciona el estado común. No se debe depender de disponer del historial de otra conversación.

Inspiración funcional: KashaFlow. El README indica que no se ha copiado su código. El comportamiento de actualización sigue Schedulime. El diseño toma como referencia tarjetas discretas, fondos cálidos y verdes suaves. Tanu es una ilustración raster original; los iconos son de Lucide.

Decisiones que se mantienen:

- Conexiones externas opcionales: banca, cartografía y búsqueda pública de comercios.
- Enable Banking mediante extensión opcional Manifest V3 para Chrome/Edge de escritorio; la importación de archivos no necesita extensión. Se eligió este puente por las restricciones CORS observadas en la API.
- Embeddings con Transformers.js; chat exclusivamente con WebLLM en equipos compatibles con WebGPU. No hay sustitución por IA en la nube.
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

El esquema IndexedDB vigente es 3 y se define para una instalación limpia, sin perfiles de importación ni migraciones de datos anteriores. Mantiene categorías, etiquetas y el índice multivalor `Movement.tagIds`. Las copias actuales también usan el formato 3 y rechazan versiones anteriores sin convertirlas. Durante el desarrollo temprano el usuario puede borrar los datos del sitio antes de probar; la aplicación no hace ese borrado automáticamente. `Movement.balance` sigue siendo opcional: nunca se inventan saldos históricos.

## Entorno de desarrollo: Rollup en Windows

- Windows bloqueó el módulo nativo de Rollup 4.63.4 con `ERR_DLOPEN_FAILED` y un mensaje de Control de aplicaciones; el aviso superior de dependencia opcional ausente era genérico. Se sustituyó por la variante oficial `@rollup/wasm-node` de la misma versión mediante `overrides` en `pnpm-workspace.yaml`, actualizando el lockfile sin cambiar el resto de versiones. No se desactivan protecciones ni se parchea `node_modules`.
- Comprobados instalación offline con lockfile congelado, carga de Vite, arranque de `pnpm dev` y respuestas HTTP 200 de HTML/TSX, 72 pruebas unitarias y compilación con tipos/PWA. Pruebas y compilación usan permisos ampliados por el bloqueo previo del sandbox a esbuild. El servidor temporal de comprobación se cerró. Sin publicación.
- Las cinco pruebas de `tanu.spec.ts` pasaron con Edge en un perfil aislado. Chromium headless shell no pudo arrancar (`spawn UNKNOWN`) incluso con permisos ampliados; no se presenta como una prueba superada. No se descargaron ni ejecutaron modelos para este cambio de herramientas.

## Funciones existentes

- Importación automática CSV, XLS/XLSX y PDF con texto mediante worker, vista previa normalizada, corrección y guardado confirmado. Selección de páginas por rangos, creación de cuenta en modal y ayuda de IA opcional, sin perfiles persistidos. Exportación CSV y copias completas JSON.
- Varias cuentas, categorías de profundidad libre, etiquetas independientes, notas, edición individual/en lote y relaciones entre movimientos.
- Transferencias internas excluidas de ingresos/gastos globales; devoluciones vinculadas reducen el gasto relacionado. Reglas ordenadas por prioridad y primera coincidencia, con protección de categorías manuales.
- Resumen, gráficos, búsquedas y calendario de recurrencias semanales, mensuales y anuales. Los vencimientos inexistentes se ajustan al final del mes.
- Importación de Google Timeline: `semanticSegments`, `timelineObjects` y `Records.json`; asignaciones geográficas sugeridas o confirmadas, con corrección manual.
- Embeddings locales para categorías y búsqueda semántica. Tanu traduce preguntas a consultas limitadas y validadas; la aplicación calcula las cifras. El chat es de consulta y no modifica movimientos.
- Tutorial y conexión bancaria mediante extensión; gestión de modelos, almacenamiento y conexiones externas en Ajustes/IA local.

La presencia de una función en código no sustituye las validaciones reales pendientes indicadas más abajo.

## Categorías jerárquicas y etiquetas

- Se conserva `Category.parentId` y una única `Movement.categoryId` opcional. `src/lib/classification.ts` centraliza rutas, antecesores, descendientes, validación de ciclos, agrupación por nivel y filtros de etiquetas. Los recorridos no imponen un máximo de profundidad ni requieren recursión.
- `Tag` contiene `id`, `name` y `normalizedName`; `Movement.tagIds` y `Snapshot.tags` guardan las asignaciones. Se normalizan espacios, mayúsculas y tildes para evitar duplicados de etiquetas; nombres visibles e identificadores permanecen separados. Las categorías pueden repetir nombre en ramas distintas; crear, renombrar o mover valida que no se duplique un nombre equivalente entre hermanos.
- Categorías muestra un editor directo del árbol: nombre, emoji y color se editan en cada fila con Guardar y Descartar. + Hija inserta una fila nueva bajo su padre y Nueva categoría crea una principal; cancelar no escribe en IndexedDB. Solo la descripción para la IA se edita en un modal, además de la confirmación de eliminación. El selector local ofrece emojis clásicos con nombres en español y búsqueda; los nombres históricos de Lucide se representan con emojis equivalentes sin reescribir los datos existentes.
- La pantalla de categorías sigue la referencia visual acordada: búsqueda, columnas alineadas de categoría/color/movimientos/acciones y pie con cantidades. Se ha eliminado la cabecera interior con el título «Categorías», su descripción y el consejo; la tarjeta empieza directamente con la búsqueda y los controles de expansión. Retirada comprobada con TypeScript y revisión del diff. La jerarquía se muestra mediante sangrías y líneas de conexión, sin rutas textuales en las filas. Los campos de nombre tienen un máximo de 280 px; Guardar y Cancelar aparecen en la misma línea en escritorio, junto al campo o en la columna de acciones si el ancho disponible es menor; en móvil se adaptan al espacio. Cancelar usa fondo rojo suave y una equis roja de trazo grueso. El cuadro del nombre aparece solo al pasar el ratón o al recibir foco; los emojis no tienen flecha de selector. La búsqueda conserva las antecesoras de las coincidencias y desactiva el arrastre mientras está filtrada.
- El arrastre mantiene el árbol visible: la rama sigue al puntero con una vista flotante, aparece un hueco con su sangría y las filas desplazadas se animan. Mover horizontalmente cambia el nivel respetando la continuidad de las ramas; se guarda solo al soltar dentro del árbol. Escape, cancelación del puntero o pérdida de foco restauran la posición sin escribir. Incluye desplazamiento automático en los bordes, tacto y teclado (Espacio, flechas, Enter y Escape), sin pantallas ni botones de destino adicionales. Se respeta la preferencia de reducir animaciones. El campo opcional `Category.order` conserva el orden entre hermanos en IndexedDB y copias de formato 3; las categorías aún sin orden mantienen su orden alfabético. Guardar campos visibles o la descripción modifica solo esos campos, conservando el padre y el orden actuales. Los movimientos validan ciclos, existencia y nombres duplicados en una transacción y conservan identificadores, reglas y asignaciones. Por decisión del usuario, eliminar una categoría borra también todos sus descendientes y reglas que los referencian; los movimientos quedan sin categoría, con origen manual y conservando sus etiquetas. La confirmación muestra cantidades y se revalida el alcance dentro de la transacción. También se retiran sugerencias y vectores de las categorías eliminadas. Un fallo revierte la operación completa.
- Etiquetas es una pantalla independiente para crear, renombrar y eliminar. Sigue la referencia visual con un buscador de ancho completo y tarjetas compactas que se distribuyen en filas, con nombre, número de movimientos y acciones de editar/eliminar. En móvil las tarjetas ocupan el ancho disponible. Conserva el orden alfabético y los diálogos existentes. Validado con compilación y tipos, la prueba de navegador de renombrado/eliminación en Edge y revisión visual de escritorio y 320 px, incluida creación y búsqueda sin distinguir tildes. El editor de movimientos permite buscar, asignar varias, quitarlas y crear nuevas al guardar; cancelar descarta las etiquetas pendientes. Las acciones en lote añaden o retiran etiquetas sin sustituir las restantes. Editar solo etiquetas o notas conserva el origen de categoría; cambiar la categoría la marca manual. El guardado revalida referencias, incluidas respuestas automáticas y ediciones abiertas antes de una eliminación.
- El catálogo nuevo se usa solo en instalaciones nuevas: Alimentación, Transporte, Vivienda, Ocio, Viajes, Salud, Compras, Ingresos y Otros, con descendientes habituales; Viajes incluye Transporte → Vuelos/Tren y Alojamiento → Hotel/Apartamento. La actualización conserva el árbol existente. No se regenera el catálogo al borrar categorías. Para probarlo desde cero basta un perfil de navegador de pruebas; no hace falta borrar el perfil habitual ni sus modelos.
- Selectores con búsqueda por nombre/ruta, teclado y selección de nodos intermedios. Los listados muestran el nombre corto y ofrecen la ruta al enfocar o pasar el ratón. Búsqueda textual de movimientos incluye antecesores y etiquetas. Filtros por rama completa y etiquetas: todas, cualquiera o sin etiquetas.
- Resumen filtra ingresos, gastos, balance, evolución y movimientos recientes. El gráfico agrupa por raíces o hijas del nodo seleccionado y separa las asignaciones directas, sin doble conteo. Los cargos previstos y el calendario siguen filtrados solo por mes y moneda. Se conserva el tratamiento contable de transferencias/devoluciones; las etiquetas pertenecen al movimiento y no se heredan por relaciones.
- Reglas y embeddings admiten toda la profundidad. Los textos de embeddings incluyen la ruta completa, por lo que mover/renombrar antecesores invalida esos vectores mediante la caché existente. No se borran modelos ni se asignan etiquetas automáticamente. Tanu acepta nombres/rutas y filtros de etiquetas validados; pide concretar nombres de categoría ambiguos. Comparte la lógica de ramas y agrupación con la interfaz y permanece de solo consulta.
- Copias JSON de formato 3 con validación de referencias, listas de etiquetas, unicidad y ciclos antes de restaurar. No hay conversión de formatos anteriores, según el alcance acordado para desarrollo temprano: se rechazan sin escribir datos. CSV añade etiquetas y usa rutas completas de categorías; para restaurar toda la clasificación se utiliza JSON. La restauración mantiene su confirmación y desactiva conexiones externas.
- Validación: comprobación de tipos y compilación; 105 pruebas unitarias y 33 pruebas de navegador en Edge superadas. Incluyen migración desde esquema 1, eliminación atómica con reversión ante fallo, referencias tardías, copias, filtros, edición en lote, navegación de cuatro niveles, teclado, renombrado/eliminación de etiquetas, 320/390 px y reinicio offline. Las tres pruebas opcionales de modelos reales se omiten: los cambios de embeddings y consultas se comprueban con datos ficticios y simulación, sin nuevas descargas ni inferencias reales.
- Validación del editor directo: compilación con tipos, 108 pruebas unitarias superadas y ocho pruebas de navegador de clasificación en Edge. Cubren edición y cancelación en fila, emojis, descripción, arrastre continuo con ratón y tacto simulado, hueco y desplazamiento antes de soltar, cancelación y persistencia, alternativa por teclado, promoción a principal, búsqueda con antecesoras, estado de hover, orden persistente, rechazo de ciclos/duplicados y restauración de orden/emojis. Capturas de escritorio y 320 px revisadas; no se han ejecutado modelos reales ni probado un dispositivo táctil físico.
- Ajuste de anchura y botones del editor: compilación con tipos y ocho pruebas existentes de navegador de clasificación en Edge; revisión visual de creación de subcategorías y móvil. Se corrige una espera de la prueba al recargar IndexedDB.
- Sin nuevas dependencias, backend, alta manual de movimientos ni publicación. Trabajo separado del commit previo `5177ec6`, que recoge únicamente los cambios anteriores de IA local.

## Navegación y distribución

### Aspecto de IA local

- La pantalla de IA presenta una cabecera con Tanu y privacidad, tres tarjetas de chat, modelos retirados en una franja y embeddings/categorización en dos columnas. El catálogo se adapta al ancho disponible y se apila en móvil. Los estilos específicos están en `src/pages/ai-page.css`.
- Se eliminan el perfil de hardware y «¿Qué modelo me conviene?». `webgpu.ts` sustituye a `hardware.ts`: solo consulta disponibilidad de WebGPU, shader-f16 y límites de búfer. No lee núcleos CPU, RAM, tipo de dispositivo ni identidad de la GPU; deja de registrar `checkedDevice`, conservando los campos históricos existentes sin usarlos para recomendar. Un punto verde/rojo con texto ocupa el lugar de la ayuda; mientras se comprueba, aparece gris. Los avisos de incompatibilidad y bloqueos de descarga/activación siguen vigentes.
- Qwen3.5 4B es siempre Recomendado, sin cambiar el modelo activo. Los nombres aparecen junto al icono y ya no incluyen «GPU N GB»; la VRAM objetivo permanece en Requisitos. Recomendado y Experimental se sitúan sobre el borde superior. Se eliminan las frases redundantes de generación/compatibilidad y la nota de pruebas pendientes de la tarjeta 9B. Comprobar offline y Desinstalar comparten fila.
- Validación del cambio: compilación con tipos, suite de 90 pruebas unitarias y, tras añadir la regresión de privacidad, las 22 pruebas de chat-client; 14 pruebas de navegador en Edge (tanu e isolation) superadas. Capturas a 1440, 1024, 390 y 320 px, con revisión visual de escritorio y móvil y comprobaciones de alineación y ausencia de desbordamiento. Instalación y WebGPU simulados, sin descargas ni ejecución de modelos reales. Cambio local, sin publicación.

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

### Importación automática y páginas por rangos

- `tabular.ts` lee CSV/TSV, Excel y HTML con extensión XLS sin ejecutar contenido. Detecta UTF-8/Windows-1252 y conserva las fechas numéricas de Excel con su calendario 1900/1904, independientemente del idioma y zona horaria del equipo. `detect.ts` produce configuración transitoria y `prepare.ts` reúne movimientos normalizados, procedencia e incidencias antes de guardar.
- Reconocimiento local de OpenBank, MyInvestor, Pibank, Revolut y N26. `pdf-reader.ts` reconstruye tablas por posiciones, fechas y límites de operación, adaptándose por página a cabeceras partidas, conceptos multilínea y los dos diseños de Revolut. Conserva el lector de certificados y el reconocimiento tabular genérico. Las páginas informativas se identifican por separado; las vacías o desconocidas que no pueden acreditarse como informativas requieren revisión. No hay OCR ni garantía para todos los diseños de un banco.
- Los diez archivos privados de referencia se leen sin modelos. En Revolut se resta la comisión del importe una sola vez, con desglose en notas, y se informa de estados no completados. N26 utiliza el importe de la cuenta y combina contraparte/referencia útil, sin usar esa referencia como identificador estable. Los registros de importe cero se conservan y el concepto vacío pasa a «Sin concepto».
- Fecha principal: operación/inicio, después contabilización y después valor cuando falta la anterior. Se preservan fechas secundarias en campos/notas; una hora sin zona queda en notas y no se convierte en un instante. No se inventan saldos ni se convierten monedas. Las diferencias de moneda o filas inválidas bloquean continuar, mostrando su origen.
- Cuenta de destino y vista previa normalizada visibles, botón «Crear cuenta» y formulario compartido con Cuentas. El segundo modal conserva archivo y selección; guardar crea y selecciona la cuenta, y cancelar descarta solo el formulario. Los diálogos tienen nombres accesibles, restauran foco y mantienen el bloqueo de actualización mientras quede alguno abierto. Guardar movimientos revalida existencia y moneda de las cuentas.
- Se elimina «Opciones avanzadas», sus ajustes manuales y los perfiles de datos, copias y validación. En Excel solo se muestra selector de hoja cuando hay varias con datos. PDF ofrece «Todas las páginas» o «Elegir páginas»: `1-29` o `1-8, 12, 20-29`. Los rangos se validan, unifican y ordenan físicamente; cambiar de archivo restablece todas las páginas. La navegación por la vista previa no modifica las páginas seleccionadas.
- La ayuda de IA ya preparada requiere pulsar «Intentar con IA local» para formatos desconocidos. Solo propone correspondencias de campos, validadas contra cabeceras y filas; una moneda conocida no puede omitirse para eludir la comprobación. No hay descargas automáticas ni IA remota. La categorización conserva la prioridad manual → reglas → IA y no es requisito de importación.
- Duplicados solo frente a movimientos ya guardados de la misma cuenta: fecha, importe, concepto y saldo. Saldos distintos conservan operaciones legítimas; si falta saldo se informa de la incertidumbre y se mantiene la selección. Se mantienen identificadores bancarios estables y no se comparan filas nuevas entre sí.
- Validación del cambio: tipos, 137 pruebas unitarias, compilación y 41 pruebas de navegador sobre `dist` superadas. Tres pruebas opcionales con modelos reales omitidas; la ayuda de IA se verifica con un modelo simulado. Comprobados teclado, móvil, rangos sobre 50 páginas, funcionamiento offline, diálogos superpuestos, cancelación y guardado transaccional. Revisión visual de escritorio y móvil con datos ficticios. Los diez originales se importaron y guardaron en contextos de navegador aislados, sin modelos ni conexiones externas. Los fixtures son completamente ficticios; originales, contenidos, recuentos privados y rutas personales permanecen fuera del repositorio. `scripts/check-import-files.mjs` permite repetir la comprobación local sin capturas, trazas ni datos extraídos persistentes. Sin publicación.

## Tanu: arquitectura conversacional y modelos locales

- Catálogo de tres variantes, exclusivamente GPU: Qwen3.5 2B/4B/9B MLC q4f16_1 para perfiles objetivo de 4/8/12 GB de VRAM. 9B lleva Experimental y permanece pendiente de ejecución real en un equipo de 12 GB. Revisiones fijadas en `models.ts`; descarga, RAM y VRAM se distinguen, sin reserva obligatoria de 3 GB.
- Interfaz verde sin pestañas ni selector CPU. Si WebGPU está ausente, devuelve adaptador nulo o rechaza el acceso, se avisa de que Tanu no puede funcionar y se bloquean descarga/activación. Se comprueban también shader-f16 y límites de búfer; esto no acredita memoria libre ni identifica siempre la causa de un bloqueo. Se recomienda siempre 4B, sin consultar CPU, RAM ni tipo de dispositivo, y sin cambiar la selección activa.
- WebLLM es el único motor conversacional: un worker parametrizado por modelo, una sola variante residente, contexto total 4096, pensamiento desactivado, `max_history_size: 1` e historial explícito. Se mantienen mensajes, JSON Schema, límites de respuesta, métricas, cancelación y validación de aplicación. Embeddings conserva Transformers.js y su motor independiente.
- Por decisión del usuario se retira toda ejecución CPU tras no encontrar una variante que cumpla velocidad y calidad. Se eliminan worker, selector de hilos, recarga para multihilo y harness de rendimiento CPU. No se distribuye el WASM de wllama; su CacheManager se conserva únicamente para detectar y desinstalar archivos GGUF. Las preferencias antiguas permanecen en los datos/copias sin controlar ningún motor.
- Reconciliación: Qwen3 1.7B CPU, Qwen3 4B/8B GPU y Qwen3.5 0.8B/2B/4B CPU quedan en «Modelos retirados» sin borrar archivos. No pueden preparar, activar ni generar aunque antes estuvieran listos. Se pide desinstalarlos e instalar una variante vigente. Las claves separan CPU/GPU y la desinstalación CPU no modifica sus variantes GPU activas.
- La antigua prueba Qwen3.5 4B GPU se promueve a `chat:gpu-4b` si coincide modelo/revisión, conservando selección y URL con revisión `44b42469f9e192814bfd90440e3b377d89ba7a13`. Los GGUF anteriores se detectan en OPFS como retirados con su URL original (incluido 4B con revisión `e87f176479d0855a907a41277aca2f8ee7a09523` y 2.740.937.888 bytes). La página experimental está eliminada; informes, descargas y perfiles locales se conservan.
- Preparar reinicia el motor y verifica JSON sin red antes de activar. Un fallo al preparar otra variante conserva la selección válida anterior. Cancelar invalida respuestas tardías y mantiene descargas. Desinstalar respeta recursos compartidos; no se vacían bases de datos ni ajustes.
- `assistant.ts` conserva decisión, conversación, ayuda, consultas e importación asistida, máximo tres inferencias y un intento corrector. Conversación con temperatura 0,7 y top-p 0,8; decisiones y consultas con temperatura cero. La aplicación calcula cifras con importes enteros y monedas separadas, sin modificar movimientos desde el chat. Historial limitado a tres intercambios, última consulta y borrador pendiente.
- Evaluación: 50 escenarios ficticios por dos vueltas, todos los críticos obligatorios y al menos 95 % por vuelta. Harness solo con `TANUKOIN_AI_EVAL=1`, excluido del producto normal; ejecuta GPU 2B/4B por separado y registra tiempos por turno terminado. Reutiliza perfiles antiguos 4B sin acceder al perfil personal. 9B se excluye de la ejecución real. Una prueba parcial o la preparación no acreditan aceptación.
- Las mediciones CPU históricas y los cuatro intentos fallidos de mejorar 0.8B se conservan en [evaluación local](evaluacion-modelos.md) y `.cache/tanu-tests/reports/`. En el Ryzen 5600X de referencia, 1.7B/2B/4B incumplen el límite acordado de 100 segundos; 0.8B cumple velocidad básica pero falla calidad. Se descartan los prototipos de instrucciones/esquema sin aplicarlos a GPU.
- Repetición GPU 4B tras retirar CPU (`gpu-4b-gpu-only.json`): 47/50 (94 %) en cada vuelta, fallos 09 (crítico: mes incorrecto), 47 (año heredado) y 49 (aclaración innecesaria). No cumple calidad. Sí supera preparación, reinicio offline, cancelación/recuperación, importación JSON, contexto/conversación prolongada y cambios 4B → 2B → 4B desde caché sin conexión, conservando ambas instalaciones. RTX 3060 Ti de 8 GB.
- Repetición GPU 2B tras retirar CPU (`gpu-2b-gpu-only.json`): 22/50 (44 %) en ambas vueltas, con fallos críticos de ruta, filtros y fechas. Supera preparación, reinicio offline y cancelación/recuperación. La importación produce JSON truncado que se rechaza; la conversación prolongada vuelve a fallar en su tercer turno. No cumple calidad.
- Validación de implementación: tipos, compilaciones normal y de evaluación, 90 pruebas unitarias y 28 pruebas generales de navegador en Edge superadas. Incluyen WebGPU ausente/adaptador nulo/acceso rechazado/falta de shader-f16, retirada de CPU sin afectar a GPU, mapas/búsquedas con CORS simulado, puente de extensión, descargas bajo aislamiento y actualización desde el service worker anterior de Workbox, conservando datos/modelos y bloqueando recargas con cambios pendientes. Cabeceras de desarrollo comprobadas en documento, worker y WASM. Vite excluye `.cache/` y `test-results/` del vigilante para evitar EBUSY en Windows. Banca con datos ficticios, sin banco real. La compilación normal final excluye harness, página de prueba y motor CPU. En la suite general se omiten tres pruebas opcionales: los dos modelos GPU se han evaluado por separado; no se vuelve a ejecutar embeddings real. Resultados detallados en [evaluación local](evaluacion-modelos.md); informes en `.cache/tanu-tests/`.
- Trabajo exclusivamente local, sin push ni despliegue. Ninguna variante ejecutada satisface todavía todos los criterios de calidad; 9B sigue pendiente por falta del hardware objetivo.

## Offline, privacidad y banca

La preparación inicial incluye aproximadamente 93 MB sin comprimir de interfaz, lectores y motores, sin el motor conversacional CPU. Las cachés de aplicación y modelos están separadas de la base de datos financiera. El indicador offline se activa al preparar los recursos; no basta con haber abierto la portada.

La PWA usa `injectManifest` y un único service worker personalizado, `src/sw.ts`, manteniendo `/Tanukoin/sw.js` y su alcance. Añade COOP `same-origin` y COEP `require-corp` a las respuestas de la aplicación desde red y caché. Desarrollo sirve las cabeceras equivalentes; las comprobaciones de compilación usan un servidor estático sin cabeceras especiales. No se fuerza una recarga inicial; el aislamiento entra en vigor al navegar o recargar bajo control del service worker. Las actualizaciones siguen respetando operaciones/ediciones pendientes. Se ha comprobado aislamiento tras reinicio offline.

La autorización bancaria retorna mediante un `BroadcastChannel` distinto por autorización y validación de `state`, sin depender de `window.opener` ni persistir códigos. La ventana elimina el código de la URL y se cierra. Se mantienen los 10 minutos de caducidad y se añade cancelación explícita; no se interpreta `popup.closed` como cancelación porque COOP puede separar las ventanas. Retorno, rechazo, estado incorrecto, cancelación y caducidad se prueban con datos ficticios.

Embeddings: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, con constantes en `src/features/ai/constants.ts`. Las tres variantes GPU del chat, con sus revisiones, están en `src/features/ai/models.ts`.

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

- GitHub Actions del commit `8441f15` se detuvo en una prueba de copias que suponía `Europe/Madrid`, mientras el runner usaba UTC; compilación y despliegue quedaron omitidos. Se reprodujo con `TZ=UTC`. La prueba compara ahora todos los ajustes anteriores tras rechazar una copia inválida, cuya zona horaria es distinta, sin depender de la zona del equipo. Las 90 pruebas unitarias pasan con `TZ=UTC` y `TZ=Europe/Madrid`. Ejecución afectada: [35774536433](https://github.com/RASK18/Tanukoin/actions/runs/35774536433).

En el cambio funcional 0.1.6 pasaron **26 pruebas unitarias y 10 pruebas de navegador**, además de tipos, compilación y el workflow de publicación. Dos pruebas opcionales de modelos no se ejecutan en la suite normal. Estos números son una referencia de esa revisión, no sustituyen ejecutar las pruebas del siguiente cambio.

Se probaron importación de archivos, arrastre, columnas desordenadas, saldos, duplicados frente a guardados, PDF de varias páginas, copias, navegación móvil/escritorio y actualización conservando datos/cachés. El PDF privado se importó y exportó localmente con todos sus movimientos y saldos, sin tráfico externo.

Pendiente de validación real o limitaciones conocidas:

- Autorización bancaria completa con credenciales de prueba/personales, cancelación y caducidad en sandbox o banco real. Las pruebas del puente no equivalen a esta validación.
- Detección de importaciones asistida por modelo real y preguntas de chat fuera de los casos comprobados. La nueva arquitectura se evalúa en perfiles aislados de Edge headless con modelos GPU reales (las mediciones CPU anteriores se conservan como históricas). La aceptación depende de completar la batería por variante indicada en la sección de IA; las pruebas parciales no la acreditan.
- Los embeddings reales se probaron anteriormente con descarga, arranque offline y búsqueda; repetir esa prueba solo si cambios relacionados lo justifican.
- No hay OCR ni compatibilidad garantizada con todos los diseños PDF. Photon y la cartografía pública dependen de disponibilidad y políticas externas.
- No existe una lista adicional de mejoras aprobadas: cada nuevo chat debe concretar su objetivo antes de ampliar alcance.

Para pruebas optativas, el README documenta `TEST_LOCAL_MODEL=1` (embeddings) y `TEST_CHAT_VARIANT` (chat real por variante). No activar descargas grandes de modelos como parte de cada prueba rutinaria.

## Cómo mantener este contexto

Al cerrar una tarea relevante, actualizar la fecha, el comportamiento afectado y la evidencia de validación. Añadir decisiones estables a `AGENTS.md` solo si realmente cambian. Eliminar afirmaciones sustituidas y conservar los límites que sigan vigentes. No incorporar extractos privados, secretos ni transcripciones completas.

Inicio sugerido para otro chat: «Trabajamos en Tanukoin. Lee AGENTS.md y docs/contexto.md, comprueba el estado del repositorio y resuelve: [problema concreto]».
