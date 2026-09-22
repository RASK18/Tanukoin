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
    "Abre la pantalla «Resumen» para ver tus finanzas. Abre «Movimientos» para importar archivos, buscar y revisar operaciones. «Cuentas» gestiona cuentas y monedas. «Categorías» organiza categorías. «Reglas» automatiza la asignación de categorías. «Suscripciones» revisa recurrencias. «Mapa» muestra ubicaciones. «IA local» prepara modelos. «Ajustes» gestiona copias y preferencias. Estos son los nombres exactos de las pantallas. Tanu puede buscar por fechas o palabras y obtener mínimos, máximos, medias y medianas. El chat no modifica datos.",
  import:
    "En Movimientos, pulsa Importar y arrastra o selecciona un CSV, Excel o PDF con texto. Elige la cuenta de destino y revisa la vista previa. Opciones avanzadas permite corregir columnas, fechas, hojas o páginas. Revisa las coincidencias antes de confirmar: nada se guarda hasta que confirmas. Los PDF escaneados no tienen OCR.",
  accounts:
    "En Cuentas puedes crear y gestionar tus cuentas y su moneda. Al importar, elige la cuenta de destino. Las monedas se muestran por separado y no se convierten automáticamente. El saldo importado de cada movimiento es histórico, no se recalcula al filtrar.",
  movements:
    "En Movimientos puedes filtrar por texto, fechas, cuenta, categoría y moneda, revisar detalles, editar operaciones y exportarlas. Puedes relacionar transferencias internas y devoluciones. El chat solo consulta: para modificar un movimiento usa esa pantalla.",
  categories:
    "En Categorías puedes organizar categorías y subcategorías. Asigna categorías en Movimientos, individualmente o en lote. Las categorías manuales se respetan; después se aplican reglas y finalmente sugerencias de IA local.",
  rules:
    "En Reglas puedes configurar condiciones para categorizar movimientos. Se aplican en orden de prioridad y gana la primera coincidencia; no sobrescriben categorías manuales. Revisa las propuestas antes de aplicarlas al historial.",
  recurrences:
    "En Suscripciones puedes gestionar pagos e ingresos recurrentes con frecuencia semanal, mensual o anual y consultar sus próximos vencimientos. Una recurrencia registrada no equivale a un cargo bancario ya realizado.",
  map: "En Mapa puedes importar un historial de Google Timeline y revisar las ubicaciones antes de guardarlas. Las asociaciones con movimientos son sugerencias revisables. El callejero requiere activar la conexión externa; las ubicaciones guardadas se consultan sin conexión.",
  ai: "En IA local puedes descargar, comprobar sin conexión o eliminar cada modelo. Tanu necesita un modelo preparado: Ligero usa CPU; Equilibrado y Avanzado requieren WebGPU y shader-f16. También hay una opción temporal Qwen3.5 · prueba para comparar calidad y consumo; mantiene su descarga independiente y no cambia tu selección automáticamente. IA local recomienda una opción según la compatibilidad detectada. Los modelos retirados no pueden usarse y se pueden desinstalar. Embeddings sirve para categorías y búsqueda por similitud. No se descargan modelos automáticamente ni se sustituyen por IA remota. Si el chat falla, usa Comprobar offline; no borres tus datos para repararlo.",
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
  rules: "/reglas",
  recurrences: "/suscripciones",
  map: "/mapa",
  ai: "/ia",
  backup: "/ajustes",
  privacy: "/ajustes",
  banking: "/banco",
  updates: "/ajustes",
};
