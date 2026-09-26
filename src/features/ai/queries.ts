import { movementDescription } from "../../lib/movement-text";
import {
  categoryTree,
  matchesTags,
  movementSearchText,
  type TagMode,
} from "../../lib/classification";
import type { Snapshot, Movement } from "../../data/types";
import {
  financialRows,
  money,
  normalize,
  totals,
  parseDate,
} from "../../lib/finance";
import { locationCandidates } from "../locations/parse";

const keywords = [
  ["nomina", "nominas", "salario", "salarios", "sueldo", "sueldos", "haberes"],
  ["factura", "facturas", "recibo", "recibos"],
  [
    "supermercado",
    "supermercados",
    "super",
    "mercadona",
    "carrefour",
    "lidl",
    "aldi",
    "eroski",
    "alcampo",
    "consum",
  ],
  [
    "alquiler",
    "alquileres",
    "arrendamiento",
    "arrendamientos",
    "renta vivienda",
  ],
];
function matchesKeyword(
  query: string,
  movement: Movement,
  data: Snapshot,
  tree: ReturnType<typeof categoryTree>,
) {
  const text = ` ${movementSearchText(movement, tree, data.tags).replace(/[^a-z0-9]+/g, " ")} `;
  const term = normalize(query).trim();
  const aliases = keywords.find(
    (group) =>
      group.includes(term) &&
      (group[0] !== "supermercado" ||
        ["supermercado", "supermercados", "super"].includes(term)),
  );
  return aliases
    ? aliases.some((word) => text.includes(` ${word} `))
    : text.includes(term.replace(/[^a-z0-9]+/g, " "));
}
export interface QuerySpec {
  op:
    | "search"
    | "sum"
    | "group"
    | "compare"
    | "recurrences"
    | "locations"
    | "merchant"
    | "min"
    | "max"
    | "mean"
    | "median";
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  tagIds?: string[];
  tagMode?: TagMode;
  currency?: string;
  text?: string;
  direction?: "expense" | "income" | "all";
  comparisonFrom?: string;
  comparisonTo?: string;
  publicName?: string;
  city?: string;

  excludeText?: string;
  minAmount?: string;
  maxAmount?: string;
  mode?: "plain" | "bounded" | "trimmed";
  trimPercent?: string;
}
export interface Clarification {
  op: "clarify";
  question: string;
}
export interface QueryResult {
  text: string;
  rows: Movement[];
  filters: string;
}
export function validateQuery(
  value: unknown,
  data: Snapshot,
): QuerySpec | Clarification {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Tanu no ha podido interpretar la consulta. Prueba indicando fechas y categoría.",
    );
  const q = value as QuerySpec;
  const keys = [
    "op",
    "from",
    "to",
    "accountId",
    "categoryId",
    "tagIds",
    "tagMode",
    "currency",
    "text",
    "direction",
    "comparisonFrom",
    "comparisonTo",
    "publicName",
    "city",
    "excludeText",
    "minAmount",
    "maxAmount",
    "mode",
    "trimPercent",
  ];
  if (
    Object.keys(q).some((k) => !keys.includes(k)) ||
    ![
      "search",
      "sum",
      "group",
      "compare",
      "recurrences",
      "locations",
      "merchant",
      "min",
      "max",
      "mean",
      "median",
    ].includes(q.op)
  )
    throw new Error("Consulta no permitida.");
  for (const [key, v] of Object.entries(q)) {
    if (key === "tagIds") {
      if (
        !Array.isArray(v) ||
        v.length > 100 ||
        v.some(
          (id) =>
            typeof id !== "string" ||
            id.length > 500 ||
            !data.tags.some((t) => t.id === id),
        ) ||
        new Set(v).size !== v.length
      )
        throw new Error("Etiquetas de consulta inválidas.");
    } else if (typeof v !== "string" || v.length > 500)
      throw new Error(`Parámetro inválido: ${key}`);
  }
  if (q.tagMode && !["all", "any", "none"].includes(q.tagMode))
    throw new Error("Modo de etiquetas inválido.");
  for (const key of ["from", "to", "comparisonFrom", "comparisonTo"] as const)
    if (
      q[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(q[key]!) ||
        !Number.isFinite(Date.parse(q[key]!)))
    )
      throw new Error("Fechas no válidas.");
  for (const key of ["from", "to", "comparisonFrom", "comparisonTo"] as const)
    if (q[key]) parseDate(q[key], "YMD");
  if (q.from && q.to && q.from > q.to)
    throw new Error("El período está invertido.");
  if (q.accountId && !data.accounts.some((a) => a.id === q.accountId))
    throw new Error("La cuenta indicada no existe.");
  if (q.categoryId && !data.categories.some((c) => c.id === q.categoryId))
    throw new Error("La categoría indicada no existe.");
  if (q.currency && !/^[A-Z]{3}$/.test(q.currency))
    throw new Error("Moneda no válida.");
  if (q.direction && !["expense", "income", "all"].includes(q.direction))
    throw new Error("Tipo de movimiento inválido.");
  if (q.mode && !["plain", "bounded", "trimmed"].includes(q.mode))
    throw new Error("Tipo de estadística no válido.");
  for (const key of ["minAmount", "maxAmount"] as const)
    if (
      q[key] !== undefined &&
      (!/^\d+$/.test(q[key]!) || !Number.isSafeInteger(Number(q[key])))
    )
      throw new Error(
        "Los límites deben ser importes positivos en unidades monetarias enteras.",
      );
  if (
    q.minAmount !== undefined &&
    q.maxAmount !== undefined &&
    Number(q.minAmount) > Number(q.maxAmount)
  )
    throw new Error("El intervalo de importes está invertido.");
  if (
    q.trimPercent !== undefined &&
    (!/^\d+(\.\d+)?$/.test(q.trimPercent) || Number(q.trimPercent) >= 50)
  )
    throw new Error(
      "El porcentaje por extremo debe estar entre 0 y menos de 50.",
    );
  if (
    (q.mode || q.trimPercent !== undefined) &&
    !["mean", "median"].includes(q.op)
  )
    throw new Error("El recorte solo se aplica a medias y medianas.");
  if (
    q.mode === "bounded" &&
    q.minAmount === undefined &&
    q.maxAmount === undefined
  )
    return {
      op: "clarify",
      question:
        "¿Entre qué importes quieres acotar la estadística? Por ejemplo, entre 20 y 100 €.",
    };
  if (q.mode === "trimmed" && q.trimPercent === undefined)
    return {
      op: "clarify",
      question:
        "¿Qué porcentaje quieres quitar de cada extremo? Por ejemplo, el 10 % menor y el 10 % mayor.",
    };
  if (q.trimPercent !== undefined && q.mode !== "trimmed")
    throw new Error(
      "Indica una estadística truncada para aplicar el porcentaje.",
    );
  if (q.comparisonFrom || q.comparisonTo) {
    if (q.op !== "compare")
      throw new Error(
        "Los períodos de comparación requieren la operación compare.",
      );
  }
  if (
    q.op === "recurrences" &&
    (q.categoryId || q.tagIds?.length || q.tagMode === "none")
  )
    return {
      op: "clarify",
      question:
        "Las recurrencias no tienen categoría ni etiquetas propias. ¿Quieres buscar los movimientos con esos filtros?",
    };
  if (
    q.op === "merchant" &&
    Object.keys(q).some((key) => !["op", "publicName", "city"].includes(key))
  )
    return {
      op: "clarify",
      question:
        "La búsqueda pública admite solo nombre del comercio y localidad. ¿Qué nombre público y localidad quieres buscar?",
    };
  if (
    ["min", "max", "mean", "median"].includes(q.op) &&
    (!q.direction || q.direction === "all")
  )
    return {
      op: "clarify",
      question: "¿Quieres calcularlo sobre gastos o sobre ingresos?",
    };
  if (
    ["sum", "group", "compare", "min", "max", "mean", "median"].includes(
      q.op,
    ) &&
    (!q.from || !q.to)
  )
    return {
      op: "clarify",
      question:
        "¿Qué período quieres consultar? Puedes indicar «este mes» o dos fechas.",
    };
  if (
    q.op === "compare" &&
    (!q.comparisonFrom || !q.comparisonTo || q.comparisonFrom > q.comparisonTo)
  )
    return { op: "clarify", question: "¿Con qué período quieres comparar?" };
  if (q.op === "merchant" && !q.publicName)
    return {
      op: "clarify",
      question:
        "¿Cuál es el nombre público del comercio y en qué localidad quieres buscar?",
    };
  return q;
}
export function executeQuery(
  q: QuerySpec | Clarification,
  data: Snapshot,
): { text: string; rows: Movement[]; filters: string } {
  if (q.op === "clarify")
    return { text: q.question, rows: [] as Movement[], filters: "" };
  const statistic = ["min", "max", "mean", "median"].includes(q.op);
  const tree = categoryTree(data.categories);
  const categoryIds = q.categoryId
    ? tree.branch(q.categoryId)
    : new Set<string>();
  const select = (from = q.from, to = q.to) =>
    (q.op === "search" || q.op === "locations"
      ? data.movements.map((m) => ({ ...m, isRefund: false }))
      : financialRows(data.movements, data.relations)
    ).filter(
      (m) =>
        (!from || m.date >= from) &&
        (!to || m.date <= to) &&
        (!q.accountId || m.accountId === q.accountId) &&
        (!q.categoryId || categoryIds.has(m.categoryId || "")) &&
        matchesTags(m, q.tagIds || [], q.tagMode) &&
        (!q.currency || m.currency === q.currency) &&
        (!q.text || matchesKeyword(q.text, m, data, tree)) &&
        (!q.excludeText || !matchesKeyword(q.excludeText, m, data, tree)) &&
        (q.minAmount === undefined ||
          Math.abs(m.amount) >= Number(q.minAmount)) &&
        (q.maxAmount === undefined ||
          Math.abs(m.amount) <= Number(q.maxAmount)) &&
        (!statistic || !m.isRefund) &&
        (q.direction !== "expense" || m.amount < 0 || m.isRefund) &&
        (q.direction !== "income" || (m.amount > 0 && !m.isRefund)),
    );
  let rows: Movement[] = select();
  const filters = [
    q.from || q.to
      ? `${q.from || "Inicio"} → ${q.to || "Hoy y posteriores"}`
      : "Todo el historial",
    q.accountId
      ? data.accounts.find((a) => a.id === q.accountId)?.name
      : "Todas las cuentas",
    q.categoryId ? tree.path(q.categoryId) : "Todas las categorías",
    q.tagMode === "none"
      ? "Sin etiquetas"
      : q.tagIds?.length
        ? `Etiquetas (${q.tagMode === "any" ? "cualquiera" : "todas"}): ${q.tagIds.map((id) => data.tags.find((t) => t.id === id)?.name).join(", ")}`
        : null,
    q.text && `Texto: ${q.text}`,
    q.excludeText && `Excluir: ${q.excludeText}`,
    q.minAmount !== undefined &&
      `Importe absoluto mínimo: ${money(Number(q.minAmount), q.currency || rows[0]?.currency || "EUR")}`,
    q.maxAmount !== undefined &&
      `Importe absoluto máximo: ${money(Number(q.maxAmount), q.currency || rows[0]?.currency || "EUR")}`,
    q.direction && q.direction !== "all"
      ? q.direction === "expense"
        ? statistic
          ? "Gastos individuales, sin transferencias ni devoluciones"
          : "Gastos y devoluciones"
        : "Ingresos"
      : null,
    q.currency,
  ]
    .filter(Boolean)
    .join(" · ");
  if (q.op === "recurrences")
    return {
      text:
        data.recurrences
          .filter(
            (r) =>
              r.active &&
              (!q.accountId || r.accountId === q.accountId) &&
              (!q.from || r.nextDate >= q.from) &&
              (!q.to || r.nextDate <= q.to) &&
              (!q.currency || r.currency === q.currency) &&
              (!q.text || normalize(r.name).includes(normalize(q.text))) &&
              (!q.excludeText ||
                !normalize(r.name).includes(normalize(q.excludeText))) &&
              (q.direction !== "expense" || r.amount < 0) &&
              (q.direction !== "income" || r.amount > 0) &&
              (q.minAmount === undefined ||
                Math.abs(r.amount) >= Number(q.minAmount)) &&
              (q.maxAmount === undefined ||
                Math.abs(r.amount) <= Number(q.maxAmount)),
          )
          .map(
            (r) =>
              `${r.name}: ${money(r.amount, r.currency)} · próxima fecha ${r.nextDate}`,
          )
          .join("\n") || "No hay recurrencias activas.",
      rows: [],
      filters,
    };
  if (q.op === "locations") {
    const suggestions = rows.map((m) => {
      const saved = data.assignments.find((a) => a.movementId === m.id);
      const place =
        saved && data.locations.find((l) => l.id === saved.locationId);
      if (place)
        return `${m.date} · ${movementDescription(m)}: ${place.name} (${saved!.status === "confirmed" ? "confirmado" : "sugerido"}).`;
      const candidates = locationCandidates(
        m,
        data.locations,
        data.settings[0]?.timezone || "Europe/Madrid",
        false,
      );
      return `${m.date} · ${movementDescription(m)}: ${
        candidates.length
          ? candidates
              .slice(0, 3)
              .map((c) => `${c.location.name} — ${c.evidence}`)
              .join("; ")
          : "sin coincidencias temporales"
      }.`;
    });
    return {
      text: suggestions.length
        ? `Posibles lugares; revisa la evidencia en el mapa antes de confirmar.\n${suggestions.slice(0, 10).join("\n")}`
        : "No hay movimientos con estos filtros.",
      rows,
      filters,
    };
  }
  const previous =
    q.op === "compare" ? select(q.comparisonFrom, q.comparisonTo) : [];
  if (!rows.length && !previous.length)
    return {
      text: "No hay movimientos que coincidan con estos filtros.",
      rows,
      filters,
    };
  if (q.op === "search")
    return { text: `He encontrado ${rows.length} movimientos.`, rows, filters };
  if (statistic) {
    const selected: Movement[] = [];
    const text = [...new Set(rows.map((m) => m.currency))]
      .map((currency) => {
        const sorted = rows
          .filter((m) => m.currency === currency)
          .sort(
            (a, b) =>
              Math.abs(a.amount) - Math.abs(b.amount) ||
              a.date.localeCompare(b.date) ||
              a.id.localeCompare(b.id),
          );
        const cut =
          q.mode === "trimmed"
            ? Math.floor((sorted.length * Number(q.trimPercent)) / 100)
            : 0;
        const sample = sorted.slice(cut, sorted.length - cut);
        const values = sample.map((m) => Math.abs(m.amount));
        const label = {
          min: "Mínimo",
          max: "Máximo",
          mean: "Media",
          median: "Mediana",
        }[q.op as "min" | "max" | "mean" | "median"];
        let value: number;
        if (q.op === "min" || q.op === "max") {
          value = q.op === "min" ? values[0] : values[values.length - 1];
          const matches = sample.filter((m) => Math.abs(m.amount) === value);
          selected.push(...matches);
          return `${currency}: ${label} ${money(value, currency)}. ${matches.map((m) => `${m.date} · ${movementDescription(m)}`).join("; ")} (${matches.length} coincidencias).`;
        }
        // BigInt keeps sums exact in minor units; round once, only for display.
        const numerator =
          q.op === "mean"
            ? values.reduce((sum, n) => sum + BigInt(n), 0n)
            : BigInt(values[Math.floor((values.length - 1) / 2)]) +
              BigInt(values[Math.floor(values.length / 2)]);
        const denominator = BigInt(q.op === "mean" ? values.length : 2);
        value = Number((numerator * 2n + denominator) / (denominator * 2n));
        selected.push(...sample);
        return `${currency}: ${label}${q.mode === "bounded" ? " acotada" : q.mode === "trimmed" ? " truncada" : ""} ${money(value, currency)} por movimiento (${sample.length} movimientos).${q.mode === "trimmed" ? ` Retirados ${cut} de cada extremo (${q.trimPercent} % por extremo, redondeado hacia abajo).${q.op === "median" ? " La truncación simétrica conserva la mediana." : ""}` : ""} Redondeo a la unidad mínima de la moneda.`;
      })
      .join("\n");
    return { text, rows: selected, filters };
  }
  const currencies = [
    ...new Set([...rows, ...previous].map((m) => m.currency)),
  ];
  const text = currencies
    .map((currency) => {
      const current = rows.filter((m) => m.currency === currency),
        t = totals(current, data.relations, data.movements);
      if (q.op === "group") {
        const cats = [
          ...new Set(
            current.map((m) => tree.group(m.categoryId, q.categoryId)),
          ),
        ];
        return (
          `${currency}\n` +
          cats
            .map((id) => {
              const amount = totals(
                current.filter(
                  (m) => tree.group(m.categoryId, q.categoryId) === id,
                ),
                data.relations,
                data.movements,
              );
              return `${(id && id === q.categoryId ? "Asignados directamente" : tree.path(id)) || "Sin categorizar"}: ${money(q.direction === "income" ? amount.income : amount.expense, currency)}`;
            })
            .join("\n")
        );
      }
      if (q.op === "compare") {
        const before = previous.filter((m) => m.currency === currency);
        const old = totals(before, data.relations, data.movements);
        const metric = q.direction === "income" ? "income" : "expense";
        return `${currency}: ${metric === "income" ? "ingresos" : "gastos"} ${money(t[metric], currency)} frente a ${money(old[metric], currency)} (${q.comparisonFrom} → ${q.comparisonTo}). Diferencia: ${money(t[metric] - old[metric], currency)}.`;
      }
      return `${currency}: ingresos ${money(t.income, currency)} · gastos netos ${money(t.expense, currency)} · balance ${money(t.balance, currency)}.`;
    })
    .join("\n");
  return {
    text,
    rows: [...new Map([...rows, ...previous].map((m) => [m.id, m])).values()],
    filters,
  };
}
