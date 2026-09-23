import { emptySnapshot, type Movement } from "../src/data/types";
import type { QuerySpec } from "../src/features/ai/queries";

// These fixtures are never included in model prompts. Cases 31–50 are held out.
export function chatFixture() {
  const data = emptySnapshot();
  data.accounts = [
    { id: "main", name: "Principal", bank: "Ficticio", currency: "EUR" },
    { id: "saving", name: "Ahorro", bank: "Ficticio", currency: "EUR" },
  ];
  data.categories = [
    { id: "food", name: "Alimentación", color: "", icon: "", description: "" },
    { id: "home", name: "Vivienda", color: "", icon: "", description: "" },
  ];
  const entries: [string, number, string, string?, string?, string?][] = [
    ["Mercadona", -1000, "2026-09-15", "food"],
    ["Lidl", -2000, "2026-09-16", "food"],
    ["Factura luz", -3000, "2026-09-17", "home"],
    ["Alquiler", -4000, "2026-09-18", "home"],
    ["Ordenador", -100000, "2026-09-19"],
    ["Abono salario", 200000, "2026-09-20"],
    ["Agosto", -5000, "2026-08-15"],
    ["Devolución ordenador", 1000, "2026-09-20"],
    ["Traspaso", -90000, "2026-09-20"],
    ["Compra antigua", -2500, "2025-09-15"],
    ["Ahorro ficticio", -700, "2026-09-15", undefined, "saving"],
  ];
  data.movements = entries.map(
    ([description, amount, date, categoryId, accountId], i): Movement => ({
      id: `m${i}`,
      accountId: accountId || "main",
      amount,
      currency: "EUR",
      date,
      description,
      merchant: "",
      notes: i === 4 ? "equipo oficina" : "",
      source: "test",
      fingerprint: `m${i}`,
      tagIds: [],
      categorySource: categoryId ? "manual" : "none",
      categoryId,
      createdAt: date,
    }),
  );
  data.relations = [
    { id: "refund", type: "refund", movementIds: ["m4", "m7"] },
    { id: "transfer", type: "transfer", movementIds: ["m8"] },
  ];
  return data;
}
export interface ChatScenario {
  id: string;
  heldOut: boolean;
  critical: boolean;
  questions: string[];
  kind: "query" | "reply" | "help" | "clarify";
  query?: Partial<QuerySpec>;
  rows?: string[];
  text?: string | string[];
  forbidden?: (keyof QuerySpec)[];
}
const september = { from: "2026-09-01", to: "2026-09-30" };
const base = { ...september, direction: "expense" as const };
const raw: Omit<ChatScenario, "id" | "heldOut" | "critical">[] = [
  { questions: ["Hola"], kind: "reply" },
  { questions: ["¿Cómo te llamas?"], kind: "reply", text: "Tanu" },
  { questions: ["¿Cómo estás?"], kind: "reply" },
  { questions: ["¿Cómo importo un PDF?"], kind: "help", text: "Movimientos" },
  {
    questions: ["¿Dónde hago una copia de seguridad?"],
    kind: "help",
    text: "Ajustes",
  },
  {
    questions: ["¿Cuánto he gastado este mes?"],
    kind: "query",
    query: { op: "sum", ...base },
    text: "1097,00",
  },
  {
    questions: ["¿Cuál ha sido el gasto más grande este mes?"],
    kind: "query",
    query: { op: "max", ...base },
    rows: ["m4"],
    text: "1000,00",
  },
  {
    questions: ["Busca mi mayor gasto de septiembre"],
    kind: "query",
    query: { op: "max", ...base },
    rows: ["m4"],
    forbidden: ["text"],
  },
  {
    questions: ["¿Cuál es el menor gasto este mes?"],
    kind: "query",
    query: { op: "min", ...base },
    rows: ["m10"],
  },
  {
    questions: ["Media de gastos de este mes"],
    kind: "query",
    query: { op: "mean", ...base },
    text: "184,50",
  },
  {
    questions: ["Mediana de gastos de este mes"],
    kind: "query",
    query: { op: "median", ...base },
    text: "25,00",
  },
  {
    questions: ["Media de gastos de este mes acotada entre 20 y 40 euros"],
    kind: "query",
    query: {
      op: "mean",
      ...base,
      mode: "bounded",
      minAmount: "2000",
      maxAmount: "4000",
    },
    rows: ["m1", "m2", "m3"],
    text: "30,00",
  },
  {
    questions: ["Mediana de gastos de este mes acotada entre 20 y 40 euros"],
    kind: "query",
    query: {
      op: "median",
      ...base,
      mode: "bounded",
      minAmount: "2000",
      maxAmount: "4000",
    },
    text: "30,00",
  },
  {
    questions: [
      "Media de gastos de este mes truncada quitando el 20 % de cada extremo",
    ],
    kind: "query",
    query: { op: "mean", ...base, mode: "trimmed", trimPercent: "20" },
    rows: ["m0", "m1", "m2", "m3"],
    text: "25,00",
  },
  {
    questions: [
      "Mediana de gastos de este mes truncada quitando el 20 % de cada extremo",
    ],
    kind: "query",
    query: { op: "median", ...base, mode: "trimmed", trimPercent: "20" },
    text: "25,00",
  },
  {
    questions: ["Media truncada de gastos de este mes"],
    kind: "clarify",
    text: "porcentaje",
  },
  {
    questions: [
      "Media truncada de gastos de este mes",
      "Quita el 20 % de cada extremo",
    ],
    kind: "query",
    query: { op: "mean", ...base, mode: "trimmed", trimPercent: "20" },
    text: "25,00",
  },
  {
    questions: ["Media acotada de gastos este mes", "Entre 20 y 40 euros"],
    kind: "query",
    query: {
      op: "mean",
      ...base,
      mode: "bounded",
      minAmount: "2000",
      maxAmount: "4000",
    },
    text: "30,00",
  },
  {
    questions: ["Busca nóminas de este mes"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m5"],
  },
  {
    questions: ["Busca facturas de septiembre"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m2"],
  },
  {
    questions: ["Busca supermercado de septiembre"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m0", "m1"],
  },
  {
    questions: ["Busca alquiler de septiembre"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m3"],
  },
  {
    questions: ["Mayor gasto de septiembre de 2025", "¿Y de agosto?"],
    kind: "query",
    query: {
      op: "max",
      direction: "expense",
      from: "2025-08-01",
      to: "2025-08-31",
    },
    rows: [],
  },
  {
    questions: ["Mayor gasto de septiembre", "¿Y el mes pasado?"],
    kind: "query",
    query: {
      op: "max",
      direction: "expense",
      from: "2026-08-01",
      to: "2026-08-31",
    },
    rows: ["m6"],
  },
  {
    questions: ["Busca alquiler en septiembre", "Busca nóminas de este mes"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m5"],
  },
  {
    questions: ["Total de gastos de la cuenta Ahorro en septiembre"],
    kind: "query",
    query: { op: "sum", ...base, accountId: "saving" },
    text: "7,00",
  },
  {
    questions: ["Total de gastos de la categoría Alimentación este mes"],
    kind: "query",
    query: { op: "sum", ...base, categoryId: "food" },
    text: "30,00",
  },
  {
    questions: ["Busca movimientos desde el 16/09/2026 hasta el 17/09/2026"],
    kind: "query",
    query: { op: "search", from: "2026-09-16", to: "2026-09-17" },
    rows: ["m1", "m2"],
  },
  {
    questions: ["Compara gastos de septiembre y agosto de 2026"],
    kind: "query",
    query: {
      op: "compare",
      ...base,
      comparisonFrom: "2026-08-01",
      comparisonTo: "2026-08-31",
    },
  },
  {
    questions: ["Busca movimientos con equipo oficina en sus notas"],
    kind: "query",
    query: { op: "search" },
    rows: ["m4"],
  },
  { questions: ["Buenas, Tanu"], kind: "reply" },
  { questions: ["Dime tu nombre, por favor"], kind: "reply", text: "Tanu" },
  {
    questions: ["¿Mis preguntas salen de este ordenador?"],
    kind: "help",
    text: [
      "local",
      "en este ordenador",
      "en tu dispositivo",
      "en el navegador",
      "en este navegador",
    ],
  },
  {
    questions: ["Oriéntame para recuperar una copia de mis datos"],
    kind: "help",
    text: "Ajustes",
  },
  {
    questions: ["Enséñame el cargo más abultado de septiembre"],
    kind: "query",
    query: { op: "max", ...base },
    rows: ["m4"],
  },
  {
    questions: ["¿Qué pago fue el más pequeño en septiembre?"],
    kind: "query",
    query: { op: "min", ...base },
    rows: ["m10"],
  },
  {
    questions: ["Saca el promedio de los cargos de septiembre"],
    kind: "query",
    query: { op: "mean", ...base },
    text: "184,50",
  },
  {
    questions: ["Quiero la mediana de lo gastado en septiembre"],
    kind: "query",
    query: { op: "median", ...base },
    text: "25,00",
  },
  {
    questions: [
      "Promedio de pagos de septiembre, solo entre 10 y 30 EUR incluidos",
    ],
    kind: "query",
    query: { op: "mean", ...base, minAmount: "1000", maxAmount: "3000" },
    text: "20,00",
  },
  {
    questions: [
      "Mediana de cargos de septiembre limitando los importes a entre 10 y 30 EUR",
    ],
    kind: "query",
    query: { op: "median", ...base, minAmount: "1000", maxAmount: "3000" },
    text: "20,00",
  },
  {
    questions: [
      "Promedio de gastos de septiembre eliminando el 20 por ciento más bajo y el 20 por ciento más alto",
    ],
    kind: "query",
    query: { op: "mean", ...base, mode: "trimmed", trimPercent: "20" },
    text: "25,00",
  },
  {
    questions: [
      "Mediana de cargos de septiembre descartando un 20 % en cada cola",
    ],
    kind: "query",
    query: { op: "median", ...base, mode: "trimmed", trimPercent: "20" },
    text: "25,00",
  },
  {
    questions: ["Localiza el sueldo ingresado durante septiembre"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m5"],
  },
  {
    questions: ["Enséñame recibos correspondientes a septiembre"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m2"],
  },
  {
    questions: ["Quiero ver lo de Mercadona en septiembre"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m0"],
  },
  {
    questions: ["Encuentra arrendamientos de este mes"],
    kind: "query",
    query: { op: "search", ...september },
    rows: ["m3"],
  },
  {
    questions: [
      "Mayor gasto de septiembre de 2025",
      "Media de gastos de septiembre",
    ],
    kind: "query",
    query: { op: "mean", ...base },
    text: "184,50",
  },
  {
    questions: [
      "Mediana de gastos truncada de septiembre",
      "Elimina un 20 % de cada extremo",
    ],
    kind: "query",
    query: { op: "median", ...base, mode: "trimmed", trimPercent: "20" },
    text: "25,00",
  },
  {
    questions: ["Media de gastos de septiembre", "Excluye el alquiler"],
    kind: "query",
    query: { op: "mean", ...base, excludeText: "alquiler" },
    rows: ["m0", "m1", "m2", "m4", "m10"],
  },
  {
    questions: ["Busca cargos de septiembre entre 15 y 35 EUR"],
    kind: "query",
    query: { op: "search", ...base, minAmount: "1500", maxAmount: "3500" },
    rows: ["m1", "m2"],
  },
];
export const chatScenarios: ChatScenario[] = raw.map((s, i) => ({
  ...s,
  id: String(i + 1).padStart(2, "0"),
  heldOut: i >= 30,
  critical: i < 30,
}));
