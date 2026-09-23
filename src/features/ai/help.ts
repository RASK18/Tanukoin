// Reviewed source material for generated help, not a natural-language router.
export const tanukoinIdentity =
  "Tanukoin es el nombre de esta web de finanzas personales. Sirve para organizar los registros de cuentas bancarias, ingresos y gastos. Sus datos e inferencias se procesan en el navegador. Tanu es su asistente de consulta. El alcance de la web se limita a las funciones documentadas; cualquier otra capacidad se considera no disponible. Tanu puede explicar conceptos generales, pero no atribuir funciones adicionales a Tanukoin.";

export const helpTopics = {
  greeting:
    "¡Hola! Soy Tanu, tu asistente local de Tanukoin. Puedo ayudarte a usar la web, buscar movimientos y calcular estadísticas. ¿Qué necesitas?",
  identity:
    "Soy Tanu, el asistente local de Tanukoin. Consulto tus datos en este navegador y no modifico tus movimientos.",
  thanks: "¡De nada! Aquí estoy si necesitas otra consulta.",
  goodbye: "¡Hasta pronto!",
  overview:
    "Abre la pantalla «Resumen» para ver tus finanzas. Abre «Movimientos» para importar archivos, buscar y revisar operaciones. «Cuentas» gestiona cuentas y monedas. «Categorías» organiza el árbol de categorías y «Etiquetas» gestiona agrupaciones transversales. «Reglas» automatiza la asignación de categorías. «Suscripciones» revisa recurrencias. «Mapa» muestra ubicaciones. «IA local» prepara modelos. «Ajustes» gestiona copias y preferencias. Estos son los nombres exactos de las pantallas. Tanu puede buscar por fechas o palabras y obtener mínimos, máximos, medias y medianas. El chat no modifica datos.",
  import:
    "En Movimientos, pulsa Importar y arrastra o selecciona un CSV, Excel o PDF con texto. Elige la cuenta de destino y revisa la vista previa. Opciones avanzadas permite corregir columnas, fechas, hojas o páginas. Revisa las coincidencias antes de confirmar: nada se guarda hasta que confirmas. Los PDF escaneados no tienen OCR.",
  accounts:
    "En Cuentas puedes crear y gestionar tus cuentas y su moneda. Al importar, elige la cuenta de destino. Las monedas se muestran por separado y no se convierten automáticamente. El saldo importado de cada movimiento es histórico, no se recalcula al filtrar.",
  movements:
    "En Movimientos puedes filtrar por texto, fechas, cuenta, categoría con todos sus descendientes, etiquetas y moneda, revisar detalles, editar operaciones y exportarlas. Puedes relacionar transferencias internas y devoluciones. El chat solo consulta: para modificar un movimiento usa esa pantalla.",
  categories:
    "En Categorías puedes organizar un árbol de profundidad libre. Cada movimiento admite una categoría, incluso una que tenga hijas. Busca por nombre y selecciona su ruta completa. En Etiquetas puedes crear, renombrar y eliminar agrupaciones independientes. Cada movimiento admite varias etiquetas; puedes crearlas al editarlo y añadirlas o quitarlas en lote. Eliminar una categoría elimina toda su rama y sus reglas y deja los movimientos sin categoría, previa confirmación del alcance. Eliminar una etiqueta solo retira sus asignaciones. Las categorías manuales se respetan; después se aplican reglas y finalmente sugerencias de IA local.",
  tags: "En Etiquetas puedes crear y renombrar agrupaciones como Vacaciones Japón o Laura. Cada movimiento admite varias etiquetas independientes de su categoría. Se asignan desde Movimientos individualmente o en lote; puedes crear una etiqueta desde el editor. Al eliminar una etiqueta se indica cuántos movimientos perderán esa asignación; los movimientos se conservan. Tanu puede filtrar consultas por etiquetas.",
  rules:
    "En Reglas puedes configurar condiciones para categorizar movimientos. Se aplican en orden de prioridad y gana la primera coincidencia; no sobrescriben categorías manuales. Revisa las propuestas antes de aplicarlas al historial.",
  recurrences:
    "En Suscripciones puedes gestionar pagos e ingresos recurrentes con frecuencia semanal, mensual o anual y consultar sus próximos vencimientos. Una recurrencia registrada no equivale a un cargo bancario ya realizado.",
  map: "En Mapa puedes importar un historial de Google Timeline y revisar las ubicaciones antes de guardarlas. Las asociaciones con movimientos son sugerencias revisables. El callejero requiere activar la conexión externa; las ubicaciones guardadas se consultan sin conexión.",
  ai: "En IA local puedes elegir Qwen3.5 2B para 4 GB de VRAM, 4B para 8 GB y 9B experimental para 12 GB, pendiente de pruebas reales. Tanu necesita WebGPU compatible: si no está disponible o está bloqueado, no puede funcionar. Puedes descargar, activar, comprobar offline, cancelar o desinstalar cada variante. Todos los modelos CPU están retirados y no pueden utilizarse; sus descargas se conservan hasta que los desinstales e instales uno vigente. Embeddings sirve para categorías y búsqueda por similitud y mantiene su motor independiente. No hay descargas automáticas ni IA remota. No borres tus datos para reparar un modelo.",
  backup:
    "En Ajustes, sección Copias de seguridad, pulsa Descargar copia completa para guardar un archivo JSON. Desde esa misma sección puedes restaurar una copia con revisión y confirmación. La copia incluye tus datos y preferencias, pero no credenciales ni modelos. Guarda copias fuera del navegador: borrar su almacenamiento elimina los datos locales.",
  privacy:
    "Tus datos e inferencias se procesan en este navegador, sin cuentas remotas ni sincronización en la nube. Las conexiones externas de banca, mapas y búsqueda son opcionales. Los datos del perfil no están cifrados; otro dispositivo, perfil u origen tiene almacenamiento independiente.",
  banking:
    "La conexión bancaria es opcional y necesita la extensión de Tanukoin para Chrome o Edge de escritorio, Application ID y una clave PEM de Enable Banking. Sigue el tutorial de banca. La clave permanece en memoria; no se envía. Solo se consultan datos, no se realizan pagos. Importar archivos no necesita extensión.",
  updates:
    "La web comprueba actualizaciones al abrir, reconectar o recuperar el foco. Cuando haya una, usa Actualizar ahora tras terminar las operaciones pendientes. La actualización conserva datos y modelos. Puedes instalar Tanukoin como PWA desde el navegador; espera a que indique Disponible sin conexión para usar los recursos offline.",
  statistics:
    "Mínimo y máximo buscan importes individuales, no la suma. Media y mediana se calculan por movimiento y moneda. Para gastos se usan cargos en valor absoluto, sin transferencias internas ni devoluciones positivas. Una estadística acotada filtra por importes inclusivos; una truncada elimina un porcentaje de cada extremo, redondeando hacia abajo el número de filas a retirar. La mediana con truncación simétrica normalmente no cambia. Indica fechas, gastos o ingresos y, si corresponde, límites o porcentaje por extremo. Los resultados se redondean a la unidad mínima de cada moneda y muestran los movimientos utilizados.",
};
export type HelpTopic = keyof typeof helpTopics;

export const helpRoutes: Partial<Record<HelpTopic, string>> = {
  import: "/movimientos",
  movements: "/movimientos",
  accounts: "/cuentas",
  categories: "/categorias",
  tags: "/etiquetas",
  rules: "/reglas",
  recurrences: "/suscripciones",
  map: "/mapa",
  ai: "/ia",
  backup: "/ajustes",
  privacy: "/ajustes",
  banking: "/banco",
  updates: "/ajustes",
};
