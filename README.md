# Tanukoin

Finanzas personales en español, en tu navegador. PWA estática sin backend, analítica ni cuentas de usuario.

**Web:** https://disboard.es/Tanukoin/ · **Licencia:** [AGPL-3.0](LICENSE.md)

![Tanukoin](public/marca/tanukoin-logo-con-tanu-y-moneda.png)

## Funciones

- Importación automática de CSV, XLS/XLSX y PDF con texto sin descargar modelos, con selección de páginas por rangos, creación de cuentas y revisión de duplicados antes de guardar.
- Cuentas, categorías jerárquicas sin límite fijo de niveles, etiquetas independientes, notas, edición en lote y relaciones de transferencia/devolución.
- Reglas por prioridad que respetan categorías manuales, con revisión para aplicarlas al historial.
- Resumen, gráficos y calendario semanal, mensual y anual. Monedas separadas, sin conversión automática.
- Google Timeline: `semanticSegments`, `timelineObjects` y `Records.json`. Ubicaciones sugeridas o confirmadas y corrección manual.
- Embeddings locales para categorizar y buscar por similitud. Tanu ofrece ayuda sobre la web, conversación básica, búsquedas y estadísticas mediante un modelo local preparado (WebGPU). La aplicación valida las consultas y calcula las cifras; el chat no modifica movimientos.
- Enable Banking mediante una extensión opcional Manifest V3 para Chrome/Edge de escritorio.
- Copias completas JSON y exportación de movimientos CSV.

## Importación de archivos

Los formatos reconocidos se leen completamente en el navegador sin modelos de IA. Se contemplan los extractos de OpenBank (incluido HTML con extensión XLS), MyInvestor, Pibank, Revolut y N26, además de tablas genéricas y certificados PDF reconocidos. Esto no garantiza todos los diseños o futuras exportaciones de cada banco. No hay OCR.

Elige primero la cuenta de destino, o pulsa **Crear cuenta** para crearla sin salir del importador. Después aparece la zona para elegir o arrastrar el archivo. Una vez elegido, queda una franja compacta con su nombre y «Cambiar archivo». La vista previa muestra los movimientos interpretados. No hay perfiles ni configuración manual de columnas: los formatos desconocidos ofrecen **Intentar con IA local** únicamente si ya hay un modelo preparado, sin descargas automáticas. Las propuestas se validan antes de utilizarlas.

En **Revisar e importar** se muestran fechas y horas principal/secundaria, concepto, referencia, contraparte, notas, importe y moneda, importe y moneda originales, comisión, cambio aplicado, saldo. No se repiten cuenta, archivo, categoría ni etiquetas en cada operación. Los datos sin incidencias son de solo lectura. Las filas con avisos se marcan en amarillo y los campos afectados llevan borde y etiqueta «Revisar»; solo estos permiten correcciones. Se distinguen «Nuevo», «Ya importado», «Completar datos» y «Revisar coincidencia». Las dudas exigen decidir entre una operación nueva, una existente u omitirla. Los conflictos muestran el valor guardado y la propuesta; requieren elegir antes de guardar. Al resolver una incidencia de divisa original, comisión o cambio aplicado, desaparecen inmediatamente su texto de respaldo en notas y sus resaltados; las demás incidencias y notas se conservan. Los campos editados inválidos bloquean el guardado. Las reglas se aplican antes de confirmar; la categorización opcional con IA se completa al guardar.

Las ampliaciones completan datos ausentes sin priorizar PDF o formatos tabulares. Un saldo bancario puede sustituir al calculado; nunca al revés. Las fechas compatibles conservan los extremos y sus horas. Los valores diferentes y los campos modificados manualmente se revisan; no se recalculan importes ni se recategorizan movimientos existentes. Se conservan sus identificadores, etiquetas y relaciones. Cancelar o fallar no guarda cambios parciales; un cambio concurrente exige revisar de nuevo.

Solo cuando el archivo no aporta **ningún saldo** y añade movimientos nuevos se muestra **Saldo antes del primer movimiento**: requiere un valor explícito, sin asumir cero ni tomar el saldo de apertura de la cuenta. Se calcula en unidades enteras siguiendo la secuencia del extracto, contando todas las filas revisadas, incluidas las desmarcadas. Las páginas excluidas y operaciones no leídas no se reconstruyen; los resultados se identifican como **Calculado**. Si existe algún saldo en el archivo, no se recalcula ninguno ni se rellenan huecos. La procedencia calculada se conserva en CSV y copias y no sirve como saldo bancario para confirmar duplicados o enlazar importaciones.

En PDF, **Todas las páginas** importa las páginas con movimientos y explica las informativas. **Elegir páginas** acepta `1-29` o `1-8, 12, 20-29`. Los rangos inválidos bloquean continuar; navegar por la vista previa no cambia la selección. En Excel con varias hojas puedes elegir la hoja.

Se guardan dos fechas: **principal**, la menor entre las disponibles en cada operación, y **secundaria**, la mayor. Se examinan operación/inicio, valor, contabilización y finalización según las columnas del archivo, sin guardarlas como cuatro campos separados. Si solo existe una fecha, la secundaria queda vacía; si dos fechas coinciden se conserva esa coincidencia. Estos nombres expresan una preferencia de presentación, no certifican cuándo comenzó la compra o llegó el dinero. Los saldos aportados por el extracto se conservan. La fecha principal no determina la posición: la secuencia puede contener pequeños retrocesos de fecha.

Cada fecha puede llevar su propia hora opcional: **Hora principal** (`time`) y **Hora secundaria** (`secondaryTime`). Se conserva la hora escrita por el banco, sin zona ni conversiones y sin duplicarla en notas. En Revolut CSV se extraen ambas; los archivos que solo incluyen fechas dejan las horas vacías. Si las fechas se intercambian, sus horas viajan con ellas; cuando coinciden y ambas tienen hora se toma la menor como principal y la mayor como secundaria. Los campos se revisan, editan y conservan en CSV y copias. Se elimina `timestamp`, sin migraciones. El mapa compara por día, pues estas horas no identifican un instante con zona horaria.

**Importe original y moneda original** son opcionales y se guardan juntos, con la precisión de esa moneda, sin conversión y sin alterar el importe de la cuenta. Se leen de columnas explícitas y de los bloques reconocidos de N26 y Revolut en PDF. En Revolut PDF, «Conversión a JPY» o «Conversión a USD» identifica el símbolo compatible del importe original de esa operación. Los símbolos que siguen siendo ambiguos o varios importes originales incompatibles se conservan en notas con un aviso, sin asignar una moneda arbitraria. Los campos pueden revisarse, editarse y exportarse a CSV; también se incluyen en snapshots y copias de formato 3.

**Comisión** (`fee`) y **Tipo de cambio aplicado** (`exchangeRate`) son campos opcionales independientes. La comisión se guarda en unidades enteras de la moneda del movimiento; cero significa que el extracto indica cero y vacío que no aporta el dato. El cambio conserva la precisión y el sentido de la expresión del banco, por ejemplo `1 EUR = 0.85 GBP`, o su decimal cuando no indica las monedas. No se calcula a partir de los importes ni se sustituye por la referencia del BCE. Se leen de columnas y bloques PDF reconocidos, se muestran en revisión y pueden editarse, exportarse y restaurarse. Los detalles PDF ambiguos permanecen en notas con un aviso.

Los registros de importe cero son válidos; un concepto vacío se guarda como «Sin concepto». Solo al leer el CSV bancario de Revolut se descuenta su comisión del importe bruto; los PDF y CSV exportados por Tanukoin ya contienen el importe neto. Editar comisión o cambio no recalcula importes ni saldos. Los detalles separados correctamente no se duplican en notas. Una moneda de cuenta incompatible bloquea la importación; la moneda original puede ser diferente. Las incidencias no se descartan silenciosamente y el guardado siempre requiere revisión y confirmación.

**Contraparte** se rellena con el nombre explícito del archivo o, si falta, con reglas locales para expresiones claras como «Pago de…», «Transferencia a…» y «Compra en…». Los formatos conocidos también identifican el nombre del establecimiento; los casos ambiguos quedan vacíos. La referencia del pago se guarda separadamente en `reference` y se concatena solo visualmente: `Transferencia a Ana Prueba. Factura 01`. La revisión, edición y CSV ofrecen el campo independiente. Las búsquedas, reglas y categorización incluyen la referencia; la comparación del concepto para duplicados la excluye.

Los IBAN no se guardan en los textos de los movimientos: se retiran del concepto, la referencia, la contraparte y las notas durante la importación y la edición. Las columnas de IBAN de contraparte se ignoran. Las copias que contengan IBAN en esos textos se rechazan sin modificar los datos actuales. No se limpian automáticamente los datos de versiones anteriores.

Durante el desarrollo temprano se trabaja con una instalación limpia. Las copias actuales usan el formato 3; no se convierten copias anteriores ni se conservan perfiles de importación. La aplicación no borra automáticamente datos para actualizarse.

Las operaciones conservan una secuencia por cuenta y moneda basada en el **orden del extracto**, también entre días. El lector comprueba las columnas de fecha originales antes de elegir la menor/mayor y usa los saldos contiguos disponibles para reconocer el sentido. Solo conserva o invierte la secuencia completa; no reordena filas por fecha principal, hora, importe o concepto. Si todas las fechas coinciden y no hay más evidencia, mantiene el orden físico. La ausencia de horas o saldos no genera por sí sola una advertencia de orden.

Las fechas y saldos son comprobaciones auxiliares: una columna de inicio que retrocede no invalida otra de finalización coherente. Los conflictos entre evidencias o secciones se avisan sin reconstruir saldos. Las páginas excluidas y filas descartadas conservan el orden relativo, sin exigir continuidad monetaria a través de huecos. «Extracto: más recientes primero» invierte la secuencia completa de cada cuenta; filtros y paginación se aplican después. Entre cuentas se combinan las secuencias por la fecha de su siguiente operación disponible, sin romper su orden interno ni atribuirles una secuencia contable común.

Las coincidencias únicas por importe, alguna de las dos fechas y saldo bancario, o por bloques de tres o más operaciones consecutivas con un único encaje y al menos dos combinaciones distintas de fecha/importe, permiten enlazar importaciones de una misma cuenta y moneda. El concepto ayuda a desambiguar, pero puede diferir entre formatos. Una operación guardada solo puede corresponder a una fila del archivo nuevo. Los saldos calculados no confirman ni rechazan correspondencias. Los archivos sin enlace fiable conservan sus cadenas separadas: se prioriza establemente lo guardado y se advierte de que su posición relativa no está confirmada. Ante ciclos se mantienen las relaciones anteriores y la secuencia interna nueva. Todo se guarda en una sola transacción. No se usan identificadores bancarios externos.

El orden se incluye en snapshots y copias. Editar fechas u horas no cambia la posición original; editar importe o saldo conserva la posición y señala que su evidencia contable fue modificada. Cambiar de cuenta o moneda retira los enlaces afectados; eliminar movimientos conserva la precedencia entre los restantes. No hay migraciones, reconstrucción de órdenes anteriores ni controles de ordenación manual.

Para comprobar archivos propios localmente después de compilar, puede usarse `node scripts/check-import-files.mjs <archivo> [...archivos]`. El comprobador crea contextos aislados, bloquea conexiones externas y no guarda capturas, trazas, documentos ni datos extraídos. Admite recuentos esperados mediante `TANUKOIN_IMPORT_EXPECTED_COUNTS`, separados por comas, y `TEST_BROWSER_CHANNEL` para elegir el navegador. No incorpores los archivos ni sus rutas personales al repositorio.

Para auditar formatos alternativos de un mismo extracto: `node scripts/check-import-pairs.mjs <formato-a> <formato-b> [...pares]`. Prueba cada pareja en ambos sentidos sobre `dist`, en cuentas y contextos desechables sin conexiones externas ni trazas. Comprueba altas y ampliaciones tras guardar y recargar, y vuelve a importar el primer archivo para verificar estabilidad. Para conflictos de campos, aplica una decisión explícita de prueba: conservar el valor guardado. No resuelve automáticamente identidades ambiguas. Usa cero como saldo inicial ficticio exclusivamente en la prueba cuando hace falta. Informa de recuentos, cambios en movimientos existentes y campos complementarios. Las correspondencias adicionales son candidatos de diagnóstico, no autorizaciones para fusionar. No modifica el perfil del navegador del usuario.

## Desarrollo

### Consultas a Tanu

Puedes preguntar «¿Cuál es el mayor gasto este mes?», «Busca nóminas de este mes», «Media de gastos entre 20 y 100 euros este mes» o «Mediana de gastos de este mes truncada quitando el 10 % de cada extremo». Los seguimientos sencillos, como «¿Y el mes pasado?», «Solo supermercado» o «Sin alquiler», conservan los filtros anteriores. Las preguntas nuevas comienzan sin esos filtros.

Las estadísticas son **por movimiento y moneda**, sin convertir divisas. Para gastos se utiliza el valor absoluto de los cargos y se excluyen transferencias internas y devoluciones positivas; los totales mantienen su cálculo neto habitual. Los límites de una estadística acotada son inclusivos. La truncación elimina el porcentaje indicado **de cada extremo**, redondeando hacia abajo el número de filas; la mediana simétricamente truncada no cambia. Si faltan límites o porcentaje, Tanu pide aclaración. Los resultados se redondean a la unidad mínima de cada moneda y muestran filtros y movimientos utilizados.

La búsqueda por palabras incluye concepto, referencia, contraparte, notas, rutas completas de categorías y etiquetas, con un vocabulario local de sinónimos para nómina, factura, supermercado y alquiler. No garantiza reconocer todos los comercios o conceptos. La ayuda usa textos revisados sobre funciones reales. Sin modelo vigente preparado, el chat muestra una guía breve y el enlace a IA local. No responde mediante reglas ni descarga modelos automáticamente.

### Categorías y etiquetas

Cada movimiento admite una categoría o puede quedar sin categorizar. Las categorías forman un árbol de profundidad libre y se puede asignar un nodo que tenga hijas. Los selectores buscan por nombre o ruta completa: por ejemplo, «vuelo» encuentra «Viajes → Transporte → Vuelos». Los filtros por categoría incluyen toda su rama. El resumen muestra categorías principales y permite entrar en sus niveles, separando los movimientos asignados directamente a cada nodo.

Las etiquetas agrupan movimientos de cualquier categoría. Puedes buscarlas, crear una al editar un movimiento y añadir o quitar varias mediante chips. Crear una etiqueta desde el editor solo se confirma al guardar; cancelar no la conserva. La pantalla Etiquetas permite renombrarlas o eliminarlas, y Movimientos permite añadirlas o quitarlas en lote sin reemplazar las demás. Los nombres equivalentes por espacios, mayúsculas o tildes reutilizan la etiqueta existente. Los filtros admiten todas las seleccionadas, cualquiera o movimientos sin etiquetas.

En Categorías, las sangrías y líneas de conexión muestran la jerarquía. Nombre, emoji y color se editan directamente en cada fila, con Guardar y Descartar; el nombre solo muestra su cuadro al pasar el ratón o recibir foco. El botón + Hija abre una fila nueva bajo su padre; Nueva categoría crea una principal. Solo la descripción para la IA se edita en un diálogo. El selector de emojis incluye búsqueda local y los iconos anteriores se muestran con su emoji equivalente. Arrastra el asa: la categoría sigue al puntero y las demás filas se desplazan para abrir un hueco. Mover a los lados cambia el nivel; llevarla a la izquierda permite convertirla en principal. El árbol y sus columnas permanecen visibles y solo se guarda al soltar. Con teclado, Espacio inicia el movimiento, las flechas ordenan o cambian el nivel, Enter confirma y Escape cancela. Puedes buscar categorías conservando sus antecesoras a la vista; para reordenar, quita primero la búsqueda. El orden se conserva al recargar y en las copias.

Mover una categoría conserva sus descendientes y asignaciones. Eliminarla requiere confirmar el alcance: se elimina toda la rama y las reglas que apuntan a ella; los movimientos permanecen sin categoría, conservan sus etiquetas y quedan protegidos de la categorización automática. Eliminar una etiqueta solo retira esa etiqueta de los movimientos. Editar etiquetas no cambia el origen manual, por regla o IA de la categoría.

Puedes preguntar a Tanu «Gastos con la etiqueta Vacaciones Japón» o «Gastos de la categoría Viajes». Ante categorías con nombres iguales, la aplicación pide concretar su ruta. Las etiquetas no se heredan entre movimientos relacionados ni se asignan mediante reglas o IA. Los cargos previstos del resumen mantienen su alcance por mes y moneda porque las recurrencias no tienen categorías ni etiquetas propias.

Las copias completas utilizan el formato 3 e incluyen árbol, etiquetas y asignaciones. Se rechazan versiones anteriores sin conversión ni alteración de los datos actuales. El CSV exporta la ruta de categoría y los nombres de etiquetas, pero la restauración completa se realiza mediante JSON.

Para probar el catálogo inicial, ejecuta `pnpm dev` y abre `http://127.0.0.1:5173/Tanukoin/` en un perfil de navegador de pruebas nuevo. Crea una cuenta e importa un CSV ficticio. Durante esta etapa no se exige compatibilidad con datos de versiones anteriores; cualquier limpieza previa la realiza el desarrollador, nunca la aplicación. El catálogo se inserta únicamente en la primera inicialización, no reaparece al eliminar categorías.

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
$env:TEST_CHAT_VARIANT = 'gpu-4b' # gpu-2b o gpu-4b
pnpm test:e2e tests/e2e/local-chat.spec.ts
Remove-Item Env:TANUKOIN_AI_EVAL, Env:TEST_BROWSER_CHANNEL, Env:TEST_CHAT_VARIANT
```

Cada variante usa un perfil aislado en `.cache/tanu-tests/`, conservando las descargas entre ejecuciones. Los informes contienen únicamente datos ficticios. Se exige carga GPU real y se ejecutan 50 escenarios dos veces, incluidos 20 reservados fuera de los ejemplos del prompt. Deben pasar todos los críticos y al menos el 95 % en cada vuelta. Las aclaraciones innecesarias cuentan como fallos. La evaluación completa añade importación, presión de contexto y conversación prolongada, reinicio offline y recuperación tras cancelar. Ejecuta las variantes por separado para no competir por la GPU. 9B no se ejecuta en el equipo de referencia de 8 GB.

Para diagnosticar un subconjunto, `TEST_CHAT_SMOKE=1` hace una sola vuelta y `TEST_CHAT_CASES='07,08'` selecciona casos. Una ejecución parcial **no acredita** la aceptación. `TEST_CHAT_CONTEXT=1` activa también el ensayo prolongado en modo diagnóstico. Los tests habituales no descargan modelos y mantienen Chromium por defecto.

`TEST_CHAT_LABEL` añade un sufijo al informe para no sobrescribir comparaciones anteriores. El informe incluye el tiempo completo de cada turno terminado; los errores se registran aparte y no cuentan como respuestas correctas. Al terminar, vuelve a compilar sin `TANUKOIN_AI_EVAL` para excluir el harness del producto. Los informes históricos de CPU se conservan, pero su motor y pruebas de ejecución se han retirado.

### Modelos de chat

#### Modelos de Tanu

| Perfil objetivo | Modelo y formato                      | Descarga de pesos |
| --------------- | ------------------------------------- | ----------------- |
| 4 GB de VRAM    | Qwen3.5 2B MLC q4f16_1                | 1,06 GB           |
| 8 GB de VRAM    | Qwen3.5 4B MLC q4f16_1                | 2,37 GB           |
| 12 GB de VRAM   | Qwen3.5 9B MLC q4f16_1 · Experimental | 5,04 GB           |

WebLLM es el único motor conversacional. Todas las variantes usan contexto total 4096 y pensamiento desactivado. 9B conserva la etiqueta Experimental y sigue pendiente de pruebas reales en equipos de 12 GB de VRAM. Transformers.js mantiene los embeddings con su motor independiente.

Tanu necesita WebGPU compatible, `shader-f16` y límites de búfer suficientes. Si la API no existe, devuelve un adaptador nulo o el navegador bloquea su acceso, se muestra un aviso y se impide descargar o activar los modelos. No se ofrece alternativa CPU. La comprobación no puede garantizar memoria libre ni identificar siempre la causa del bloqueo. El resto de Tanukoin sigue disponible.

La PWA conserva un único service worker personalizado para precaché y COOP/COEP. No hay recarga automática ni control para habilitar hilos CPU. `pnpm dev` sirve cabeceras equivalentes; `pnpm preview` carece de ellas para comprobar el comportamiento de un servidor estático como GitHub Pages. El retorno bancario utiliza BroadcastChannel por autorización y valida el state, sin códigos persistidos ni dependencia de window.opener.

La página temporal, el worker CPU y el selector de hilos se han retirado. Los modelos CPU instalados quedan en «Modelos retirados», sin posibilidad de activarlos ni generar. Sus archivos se conservan para desinstalarlos voluntariamente e instalar un modelo vigente. Las claves distinguen CPU y GPU: retirar o desinstalar 2B/4B CPU no afecta a 2B/4B GPU. Se mantiene únicamente CacheManager de wllama para detectar y desinstalar GGUF anteriores; no se distribuye su motor WASM. Los informes locales y preferencias antiguas se conservan.

Las respuestas conversacionales se generan en un paso propio, con temperatura 0,7 y top-p 0,8; las decisiones y parámetros de consultas mantienen temperatura cero y validación estructurada. Se conserva el máximo de tres inferencias por turno.

Tanu recibe la identidad y las funciones confirmadas de Tanukoin también al conversar, para no atribuirle funciones de criptomonedas o inversión. La respuesta normal se solicita en una a tres frases, hasta 60 palabras; solo se amplía, hasta 120, si se piden detalles. Son instrucciones al modelo: no se recorta el texto generado ni se cambia su temperatura.

Para una comparación corta con datos ficticios, compila con `TANUKOIN_AI_EVAL=1` y ejecuta `tests/e2e/local-chat.spec.ts` con `TEST_BROWSER_CHANNEL=msedge`, `TEST_CHAT_VARIANT=gpu-4b` (o `gpu-2b`), `TEST_CHAT_SMOKE=1`, `TEST_CHAT_COMPARE=1` y `TEST_CHAT_CASES=03,07,10,16,24,33,45,50`. Cada variante se ejecuta por separado, con límite de diez minutos en modo diagnóstico. Los informes `comparison-*.json` conservan cuatro turnos de conversación y, si está disponible `nvidia-smi`, muestras de VRAM y utilización **totales de la GPU**, incluyendo otros procesos. No acreditan la fluidez del escritorio ni la aceptación completa del modelo. Los informes históricos no se sobrescriben. Al terminar, vuelve a compilar sin `TANUKOIN_AI_EVAL` para usar la aplicación normal.

Para la regresión breve de identidad, funciones y longitud, usa `TEST_CHAT_STYLE=1` en lugar de `TEST_CHAT_COMPARE`, junto con `TEST_CHAT_SMOKE=1` y `TEST_CHAT_CASES=03,07,24,33`. Guarda ocho respuestas de siete conversaciones ficticias en `style-<variante>.json`, comprueba sus límites de palabras y las afirmaciones sobre funciones inexistentes. Revisa también el contenido completo del informe: las comprobaciones de texto no garantizan exactitud semántica. Libera la GPU de otros modelos antes de ejecutar esta prueba.

Las cifras de descarga no equivalen a RAM o VRAM necesaria. Los niveles GPU son perfiles objetivo, sin una reserva obligatoria de 3 GB. El navegador no permite deducir la VRAM a partir de RAM ni garantiza memoria libre suficiente. 4B es la recomendación fija del catálogo; no cambia la selección activa. Solo se comprueba WebGPU: no se consultan núcleos CPU, RAM ni tipo de dispositivo. El resultado se muestra como un punto verde o rojo con texto junto a la cabecera del catálogo.

La opción CPU se ha retirado por los resultados de velocidad y calidad. Las pruebas reales también detectan fallos críticos de calidad en GPU 2B/4B; no se declara una variante validada sin superar la batería exigida. Véanse [resultados y limitaciones](docs/evaluacion-modelos.md).

Qwen3 1.7B CPU, 4B GPU y 8B GPU se conservan en Modelos retirados hasta su desinstalación manual. La antigua prueba Qwen3.5 4B GPU se convierte en la variante de 8 GB cuando coincide su revisión, conservando selección y descarga. CPU y GPU tienen archivos independientes. El catálogo fija revisiones en `src/features/ai/models.ts`.

## Publicación y versiones

GitHub Actions comprueba tipos, pruebas unitarias, compilación y pruebas de navegador antes de publicar. Configura **Settings → Pages → Source → GitHub Actions**. La ruta es `/Tanukoin/`; `disboard.es` se hereda del sitio de usuario de GitHub Pages.

El versionado sigue Schedulime: `major.minor` del paquete y número de commits, con respaldo al patch del paquete. `APP_VERSION` y `APP_UPDATED_AT` permiten sobrescribirlo. Se genera `version.json` y se comprueba al abrir, reconectar o volver a la pestaña, como máximo una vez cada 15 minutos. **Actualizar ahora** espera al service worker y se desactiva durante operaciones o ediciones pendientes.

Las actualizaciones no borran IndexedDB ni las cachés independientes de modelos. El esquema actual es 3, definido para una instalación limpia. Durante el desarrollo temprano no se exige retrocompatibilidad con datos, ajustes o copias anteriores ni se añaden migraciones para conservarlos. Si hace falta una prueba limpia, el usuario borra los datos del sitio; la aplicación no lo hace automáticamente. Los datos de la versión vigente siguen protegidos ante errores y cancelaciones.

## Extensión bancaria

La compilación genera `extension-dist/` y `dist/extension/tanukoin-extension.zip`. Descomprime el ZIP y usa **Cargar descomprimida** en `chrome://extensions` o `edge://extensions`, con modo desarrollador activado.

Los workflows fijan `SITE_ORIGIN=https://disboard.es`; una compilación local usa `http://127.0.0.1:5173`. Para otra instalación, establece `SITE_ORIGIN` antes de compilar. El conector valida origen, ruta y operaciones y solo consulta `api.enablebanking.com`. No permite pagos ni URLs arbitrarias. Las etiquetas Git `v*` publican el ZIP en Releases. Su actualización es independiente de la PWA.

Cada persona necesita su propia aplicación, Application ID, PEM PKCS#8 y cuentas vinculadas en Enable Banking. La guía integrada muestra la URL exacta de retorno. Web Crypto importa la clave como no exportable y la mantiene en memoria. Se envían tokens firmados y solicitudes bancarias, nunca el PEM. Una recarga obliga a cargar credenciales y autorizar de nuevo.

## Offline y privacidad

La aplicación prepara aproximadamente 100 MB sin comprimir de interfaz, lectores y motores; los modelos se descargan aparte, por decisión del usuario. Espera al indicador **Disponible sin conexión**. Importar archivos, editar, consultar, generar gráficos y consultar ubicaciones guardadas funciona offline. Cada modelo se marca preparado después de reiniciarlo y ejecutarlo sin permitir descargas externas.

Mapas, búsqueda y banca empiezan desactivados. El callejero usa OpenStreetMap online sin descargas masivas. La búsqueda muestra el nombre público y localidad que enviará a Photon/Wikipedia. Los archivos, importes, conversaciones e historial completo no se envían a esos servicios. Descargar modelos contacta con Hugging Face y los recursos de WebLLM. No existe sustitución por IA remota.

Tanukoin no cifra los datos: quien acceda a tu perfil del navegador puede leerlos. Borrar el almacenamiento elimina la información local; el navegador también puede desalojar cachés. Solicita almacenamiento persistente y descarga copias en Ajustes. Las copias excluyen credenciales y modelos; restaurarlas desactiva las conexiones externas.

## Validación y límites

Las pruebas cubren cálculos, fechas, relaciones, reglas, recurrencias, consultas de Tanu, Timeline, copias y restricciones del puente. Playwright verifica los flujos principales, lectores, arranque offline y diseño móvil/escritorio. La prueba optativa usa embeddings reales y comprueba su caché offline.

La autorización real bancaria requiere credenciales personales y pruebas con el sandbox o banco. Los modelos GPU necesitan WebGPU, `shader-f16` y memoria suficiente. La carga, el rendimiento y la calidad conversacional deben comprobarse por variante con modelos reales. Estas comprobaciones externas no quedan sustituidas por tests de lógica. No hay OCR: los PDF escaneados necesitan otro formato y los diseños complejos pueden necesitar correcciones. Las ubicaciones y categorías inferidas son propuestas revisables.

## Código y atribuciones

`src/data`: base local; `src/lib`: cálculos y copias; `src/features`: importación, banca, ubicaciones e IA; `src/pages`: pantallas; `extension`: conector independiente. Archivos e IA se procesan en workers. No hay secretos del usuario en la compilación.

Inspirado por [KashaFlow](https://github.com/KashaMalaga/KashaFlow) y por las actualizaciones de Schedulime. No se ha copiado código de KashaFlow. Tanu es una ilustración raster original creada para este proyecto; los iconos proceden de Lucide. Véanse las [atribuciones](THIRD_PARTY_NOTICES.md).
