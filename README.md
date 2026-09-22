# Tanukoin

Finanzas personales en español, en tu navegador. PWA estática sin backend, analítica ni cuentas de usuario.

**Web:** https://disboard.es/Tanukoin/ · **Licencia:** [AGPL-3.0](LICENSE.md)

![Tanu](public/tanu.webp)

## Funciones

- CSV, XLS/XLSX y PDF con texto: columnas configurables, perfiles, corrección y revisión de duplicados antes de guardar.
- Cuentas, categorías de dos niveles, notas, edición en lote y relaciones de transferencia/devolución.
- Reglas por prioridad que respetan categorías manuales, con revisión para aplicarlas al historial.
- Resumen, gráficos y calendario semanal, mensual y anual. Monedas separadas, sin conversión automática.
- Google Timeline: `semanticSegments`, `timelineObjects` y `Records.json`. Ubicaciones sugeridas o confirmadas y corrección manual.
- Embeddings locales para categorizar y buscar por similitud. Tanu ofrece ayuda sobre la web, conversación básica, búsquedas y estadísticas mediante un modelo local preparado (CPU o WebGPU). La aplicación valida las consultas y calcula las cifras; el chat no modifica movimientos.
- Enable Banking mediante una extensión opcional Manifest V3 para Chrome/Edge de escritorio.
- Copias completas JSON y exportación de movimientos CSV.

## Desarrollo

### Consultas a Tanu

Puedes preguntar «¿Cuál es el mayor gasto este mes?», «Busca nóminas de este mes», «Media de gastos entre 20 y 100 euros este mes» o «Mediana de gastos de este mes truncada quitando el 10 % de cada extremo». Los seguimientos sencillos, como «¿Y el mes pasado?», «Solo supermercado» o «Sin alquiler», conservan los filtros anteriores. Las preguntas nuevas comienzan sin esos filtros.

Las estadísticas son **por movimiento y moneda**, sin convertir divisas. Para gastos se utiliza el valor absoluto de los cargos y se excluyen transferencias internas y devoluciones positivas; los totales mantienen su cálculo neto habitual. Los límites de una estadística acotada son inclusivos. La truncación elimina el porcentaje indicado **de cada extremo**, redondeando hacia abajo el número de filas; la mediana simétricamente truncada no cambia. Si faltan límites o porcentaje, Tanu pide aclaración. Los resultados se redondean a la unidad mínima de cada moneda y muestran filtros y movimientos utilizados.

La búsqueda por palabras incluye concepto, comercio, notas y categorías, con un vocabulario local de sinónimos para nómina, factura, supermercado y alquiler. No garantiza reconocer todos los comercios o conceptos. La ayuda usa textos revisados sobre funciones reales. Sin modelo vigente preparado, el chat muestra una guía breve y el enlace a IA local. No responde mediante reglas ni descarga modelos automáticamente.

### Entorno

Node.js 24 y pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Abre `http://127.0.0.1:5173/Tanukoin/`. Cambiar dominio, puerto o perfil abre otro espacio de almacenamiento local.

El proyecto usa la variante oficial `@rollup/wasm-node` 4.63.4 mediante un override en `pnpm-workspace.yaml`. Mantiene la interfaz de Rollup y evita cargar su módulo nativo, que puede ser bloqueado por Control de aplicaciones de Windows (`ERR_DLOPEN_FAILED`). Se instala con el mismo `pnpm install --frozen-lockfile`; no requiere desactivar protecciones, borrar el lockfile ni instalar con npm. Véase la [arquitectura oficial de Rollup](https://github.com/rollup/rollup/blob/master/ARCHITECTURE.md).

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm preview
```

Playwright prueba `dist/`. Para comprobar el modelo real (descarga aproximada de 118 MB), usa `TEST_LOCAL_MODEL=1 pnpm test:e2e` en Bash o `$env:TEST_LOCAL_MODEL='1'; pnpm test:e2e` en PowerShell. Esta descarga no se realiza en cada despliegue.

La evaluación real del chat se compila como una entrada separada, excluida de la compilación normal. Necesita Edge instalado (o el canal Chromium completo), almacenamiento para las descargas y hardware compatible:

```powershell
$env:TANUKOIN_AI_EVAL = '1'
pnpm build
$env:TEST_BROWSER_CHANNEL = 'msedge'
$env:TEST_CHAT_VARIANT = 'balanced' # light, balanced o advanced
pnpm test:e2e tests/e2e/local-chat.spec.ts
Remove-Item Env:TANUKOIN_AI_EVAL, Env:TEST_BROWSER_CHANNEL, Env:TEST_CHAT_VARIANT
```

Cada variante usa un perfil aislado en `.cache/tanu-tests/`, conservando las descargas entre ejecuciones. Los informes contienen únicamente datos ficticios. CPU desactiva WebGPU; GPU exige carga real. Se ejecutan 50 escenarios dos veces, incluidos 20 reservados fuera de los ejemplos del prompt. Se exige que pasen todos los críticos y al menos el 95 % en cada vuelta. Las aclaraciones innecesarias cuentan como fallos. Avanzado añade presión de contexto y conversación prolongada; todos comprueban reinicio offline y recuperación tras cancelar. No ejecutes dos variantes GPU simultáneamente al medir memoria. Si ejecutas pruebas de CPU y GPU en paralelo, mantén un servidor independiente con `pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort` para que una suite no cierre el servidor de la otra.

Para diagnosticar un subconjunto, `TEST_CHAT_SMOKE=1` hace una sola vuelta y `TEST_CHAT_CASES='07,08'` selecciona casos. Una ejecución parcial **no acredita** la aceptación. `TEST_CHAT_CONTEXT=1` activa también el ensayo prolongado de Avanzado en modo diagnóstico. Los tests habituales no descargan modelos y mantienen Chromium por defecto.

### Modelos de chat

| Nivel | Modelo y motor | Descarga aproximada |
| --- | --- | --- |
| Ligero | Qwen3 1.7B ONNX q8, CPU/WebAssembly | 1,76 GB |
| Equilibrado | Qwen3 4B MLC q4f16_1, WebGPU | 2,5 GB |
| Avanzado | Qwen3 8B MLC q4f16_1, WebGPU, GPU de 8 GB | 4,8 GB |
| Prueba temporal | Qwen3.5 4B MLC q4f16_1, WebGPU | 2,37 GB |

La opción **Qwen3.5 · prueba** permite comparar conversación y consumo con Avanzado. Tiene revisión y caché independientes y no sustituye ni activa automáticamente otro modelo. Su memoria gráfica estimada por WebLLM es de unos 3,9 GB; la cifra real y la fluidez dependen del equipo y los otros procesos. Se mantiene como experimento hasta completar la evaluación.

Las respuestas conversacionales se generan en un paso propio, con temperatura 0,7 y top-p 0,8; las decisiones y parámetros de consultas mantienen temperatura cero y validación estructurada. Se conserva el máximo de tres inferencias por turno.

Tanu recibe la identidad y las funciones confirmadas de Tanukoin también al conversar, para no atribuirle funciones de criptomonedas o inversión. La respuesta normal se solicita en una a tres frases, hasta 60 palabras; solo se amplía, hasta 120, si se piden detalles. Son instrucciones al modelo: no se recorta el texto generado ni se cambia su temperatura.

Para una comparación corta con datos ficticios, compila con `TANUKOIN_AI_EVAL=1` y ejecuta `tests/e2e/local-chat.spec.ts` con `TEST_BROWSER_CHANNEL=msedge`, `TEST_CHAT_VARIANT=balanced-trial` (o `advanced`), `TEST_CHAT_SMOKE=1`, `TEST_CHAT_COMPARE=1` y `TEST_CHAT_CASES=03,07,10,16,24,33,45,50`. Cada variante se ejecuta por separado, con límite de diez minutos en modo diagnóstico. Los informes `comparison-*.json` conservan cuatro turnos de conversación y, si está disponible `nvidia-smi`, muestras de VRAM y utilización **totales de la GPU**, incluyendo otros procesos. No acreditan la fluidez del escritorio ni la aceptación completa del modelo. Los informes históricos no se sobrescriben. Al terminar, vuelve a compilar sin `TANUKOIN_AI_EVAL` para usar la aplicación normal.

Para la regresión breve de identidad, funciones y longitud, usa `TEST_CHAT_STYLE=1` en lugar de `TEST_CHAT_COMPARE`, junto con `TEST_CHAT_SMOKE=1` y `TEST_CHAT_CASES=03,07,24,33`. Guarda ocho respuestas de siete conversaciones ficticias en `style-<variante>.json`, comprueba sus límites de palabras y las afirmaciones sobre funciones inexistentes. Revisa también el contenido completo del informe: las comprobaciones de texto no garantizan exactitud semántica. Libera la GPU de otros modelos antes de ejecutar esta prueba.

Las cifras de descarga no equivalen a RAM o VRAM necesaria. GPU requiere `shader-f16`; Avanzado limita el contexto completo a 4096 tokens. Solo se mantiene un modelo de chat cargado. IA local muestra un perfil orientativo con núcleos lógicos de CPU, RAM aproximada, disponibilidad de WebGPU y tipo de dispositivo. La recomendación usa ese perfil y los límites de WebGPU, sin consultar la cuota de almacenamiento, que algunos navegadores alteran por privacidad. En móvil/tableta o con menos de cuatro núcleos lógicos indicados se aconseja empezar con Ligero; con WebGPU compatible y al menos 8 GB de RAM se recomienda Equilibrado en los demás casos. Son recomendaciones, no bloqueos de elección. Los datos no disponibles no se inventan y la VRAM libre no se conoce con precisión. Avanzado solo se recomienda automáticamente tras una comprobación local satisfactoria. Cambiar de modelo requiere una acción del usuario y conserva las demás descargas.

El Qwen3 1.7B GPU antiguo queda retirado: no sirve para chat ni importación asistida. Se conserva su caché y se ofrece desinstalarlo individualmente. La variante CPU tiene revisión, caché y comprobación propias. El catálogo está en `src/features/ai/models.ts`.

## Publicación y versiones

GitHub Actions comprueba tipos, pruebas unitarias, compilación y pruebas de navegador antes de publicar. Configura **Settings → Pages → Source → GitHub Actions**. La ruta es `/Tanukoin/`; `disboard.es` se hereda del sitio de usuario de GitHub Pages.

El versionado sigue Schedulime: `major.minor` del paquete y número de commits, con respaldo al patch del paquete. `APP_VERSION` y `APP_UPDATED_AT` permiten sobrescribirlo. Se genera `version.json` y se comprueba al abrir, reconectar o volver a la pestaña, como máximo una vez cada 15 minutos. **Actualizar ahora** espera al service worker y se desactiva durante operaciones o ediciones pendientes.

Actualizar conserva IndexedDB y las cachés independientes de modelos. El esquema actual es 1. Las futuras migraciones deberán añadirse mediante `db.version(...).upgrade(...)` y probarse con una base anterior.

## Extensión bancaria

La compilación genera `extension-dist/` y `dist/extension/tanukoin-extension.zip`. Descomprime el ZIP y usa **Cargar descomprimida** en `chrome://extensions` o `edge://extensions`, con modo desarrollador activado.

Los workflows fijan `SITE_ORIGIN=https://disboard.es`; una compilación local usa `http://127.0.0.1:5173`. Para otra instalación, establece `SITE_ORIGIN` antes de compilar. El conector valida origen, ruta y operaciones y solo consulta `api.enablebanking.com`. No permite pagos ni URLs arbitrarias. Las etiquetas Git `v*` publican el ZIP en Releases. Su actualización es independiente de la PWA.

Cada persona necesita su propia aplicación, Application ID, PEM PKCS#8 y cuentas vinculadas en Enable Banking. La guía integrada muestra la URL exacta de retorno. Web Crypto importa la clave como no exportable y la mantiene en memoria. Se envían tokens firmados y solicitudes bancarias, nunca el PEM. Una recarga obliga a cargar credenciales y autorizar de nuevo.

## Offline y privacidad

La aplicación prepara aproximadamente 90 MB sin comprimir de interfaz, lectores y motores; los modelos se descargan aparte, por decisión del usuario. Espera al indicador **Disponible sin conexión**. Importar archivos, editar, consultar, generar gráficos y consultar ubicaciones guardadas funciona offline. Cada modelo se marca preparado después de reiniciarlo y ejecutarlo sin permitir descargas externas.

Mapas, búsqueda y banca empiezan desactivados. El callejero usa OpenStreetMap online sin descargas masivas. La búsqueda muestra el nombre público y localidad que enviará a Photon/Wikipedia. Los archivos, importes, conversaciones e historial completo no se envían a esos servicios. Descargar modelos contacta con Hugging Face y los recursos de WebLLM. No existe sustitución por IA remota.

Tanukoin no cifra los datos: quien acceda a tu perfil del navegador puede leerlos. Borrar el almacenamiento elimina la información local; el navegador también puede desalojar cachés. Solicita almacenamiento persistente y descarga copias en Ajustes. Las copias excluyen credenciales y modelos; restaurarlas desactiva las conexiones externas.

## Validación y límites

Las pruebas cubren cálculos, fechas, relaciones, reglas, recurrencias, consultas de Tanu, Timeline, copias y restricciones del puente. Playwright verifica los flujos principales, lectores, arranque offline y diseño móvil/escritorio. La prueba optativa usa embeddings reales y comprueba su caché offline.

La autorización real bancaria requiere credenciales personales y pruebas con el sandbox o banco. Los modelos GPU necesitan WebGPU, `shader-f16` y memoria suficiente; Ligero utiliza CPU. La carga, el rendimiento y la calidad conversacional deben comprobarse por variante con modelos reales. Estas comprobaciones externas no quedan sustituidas por tests de lógica. No hay OCR: los PDF escaneados necesitan otro formato y los diseños complejos pueden necesitar correcciones. Las ubicaciones y categorías inferidas son propuestas revisables.

## Código y atribuciones

`src/data`: base local; `src/lib`: cálculos y copias; `src/features`: importación, banca, ubicaciones e IA; `src/pages`: pantallas; `extension`: conector independiente. Archivos e IA se procesan en workers. No hay secretos del usuario en la compilación.

Inspirado por [KashaFlow](https://github.com/KashaMalaga/KashaFlow) y por las actualizaciones de Schedulime. No se ha copiado código de KashaFlow. Tanu es una ilustración raster original creada para este proyecto; los iconos proceden de Lucide. Véanse las [atribuciones](THIRD_PARTY_NOTICES.md).
