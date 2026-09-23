import { makeTag, validateCategoryTree } from "./classification";
import { db, readSnapshot } from "../data/db";
import type { Snapshot } from "../data/types";
import { parseDate, validateRelation } from "./finance";

const tables = [
  "accounts",
  "movements",
  "categories",
  "tags",
  "rules",
  "recurrences",
  "relations",
  "locations",
  "assignments",
  "profiles",
  "settings",
] as const;
const fields: Record<(typeof tables)[number], string[]> = {
  accounts: [
    "id",
    "name",
    "bank",
    "currency",
    "openingBalance",
    "bankBalance",
    "bankBalanceAt",
    "externalId",
  ],
  movements: [
    "id",
    "accountId",
    "amount",
    "currency",
    "description",
    "merchant",
    "date",
    "bookingDate",
    "balance",
    "timestamp",
    "categoryId",
    "tagIds",
    "categorySource",
    "notes",
    "source",
    "externalId",
    "fingerprint",
    "importId",
    "aiSuggestion",
    "createdAt",
  ],
  categories: ["id", "name", "color", "icon", "parentId", "description"],
  tags: ["id", "name", "normalizedName"],
  rules: [
    "id",
    "name",
    "enabled",
    "priority",
    "descriptionContains",
    "merchantContains",
    "accountId",
    "minAmount",
    "maxAmount",
    "categoryId",
    "note",
  ],
  recurrences: [
    "id",
    "name",
    "accountId",
    "amount",
    "currency",
    "frequency",
    "anchorDate",
    "nextDate",
    "active",
    "movementIds",
  ],
  relations: ["id", "type", "movementIds"],
  locations: ["id", "lat", "lng", "start", "end", "accuracy", "name", "source"],
  assignments: ["id", "movementId", "locationId", "status", "evidence"],
  profiles: ["id", "name", "headerRow", "dateFormat", "decimal", "columns"],
  settings: [
    "id",
    "maps",
    "search",
    "banking",
    "timezone",
    "hideImportWelcome",
    "hideTanuWelcome",
    "cpuThreads",
  ],
};
const required: Record<(typeof tables)[number], Record<string, string>> = {
  accounts: { name: "string", bank: "string", currency: "string" },
  movements: {
    accountId: "string",
    amount: "number",
    currency: "string",
    description: "string",
    merchant: "string",
    date: "string",
    categorySource: "string",
    tagIds: "object",
    notes: "string",
    source: "string",
    fingerprint: "string",
    createdAt: "string",
  },
  tags: { name: "string", normalizedName: "string" },
  categories: {
    name: "string",
    color: "string",
    icon: "string",
    description: "string",
  },
  rules: {
    name: "string",
    enabled: "boolean",
    priority: "number",
    descriptionContains: "string",
    merchantContains: "string",
    note: "string",
  },
  recurrences: {
    name: "string",
    accountId: "string",
    amount: "number",
    currency: "string",
    frequency: "string",
    anchorDate: "string",
    nextDate: "string",
    active: "boolean",
    movementIds: "object",
  },
  relations: { type: "string", movementIds: "object" },
  locations: {
    lat: "number",
    lng: "number",
    start: "string",
    end: "string",
    name: "string",
    source: "string",
  },
  assignments: {
    movementId: "string",
    locationId: "string",
    status: "string",
    evidence: "string",
  },
  profiles: {
    name: "string",
    headerRow: "number",
    dateFormat: "string",
    decimal: "string",
    columns: "object",
  },
  settings: {
    maps: "boolean",
    search: "boolean",
    banking: "boolean",
    timezone: "string",
  },
};
export function validateBackup(input: unknown): Snapshot {
  if (!input || typeof input !== "object")
    throw new Error("La copia no es un objeto válido");
  const envelope = input as Record<string, unknown>;
  if (
    envelope.app !== "Tanukoin" ||
    envelope.schemaVersion !== 2 ||
    !envelope.data ||
    typeof envelope.data !== "object"
  )
    throw new Error(
      "Copia incompatible: se requiere formato Tanukoin, esquema 2. Las copias antiguas del esquema 1 no se importan; exporta una copia nueva desde la aplicación actualizada.",
    );
  const data = envelope.data as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (key) => !tables.includes(key as (typeof tables)[number]),
    )
  )
    throw new Error("La copia contiene tablas desconocidas");
  for (const table of tables) {
    if (!Array.isArray(data[table])) throw new Error(`Falta la tabla ${table}`);
    const ids = new Set();
    for (const row of data[table] as Record<string, unknown>[]) {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.id !== "string" ||
        !row.id ||
        ids.has(row.id)
      )
        throw new Error(`Identificador inválido en ${table}`);
      ids.add(row.id);
      if (Object.keys(row).some((k) => !fields[table].includes(k)))
        throw new Error(`Campos desconocidos en ${table}`);
      for (const [key, type] of Object.entries(required[table]))
        if (typeof row[key] !== type || row[key] === null)
          throw new Error(`Campo ${table}.${key} inválido`);
      for (const [key, value] of Object.entries(row)) {
        if (
          [
            "bankBalanceAt",
            "externalId",
            "bookingDate",
            "timestamp",
            "categoryId",
            "importId",
            "parentId",
            "accountId",
          ].includes(key) &&
          value !== undefined &&
          typeof value !== "string"
        )
          throw new Error(`Texto inválido: ${key}`);
        if (typeof value === "number" && !Number.isFinite(value))
          throw new Error(`Número inválido: ${key}`);
        if (
          [
            "amount",
            "openingBalance",
            "balance",
            "bankBalance",
            "minAmount",
            "maxAmount",
            "priority",
          ].includes(key) &&
          value !== undefined &&
          !Number.isSafeInteger(value)
        )
          throw new Error(`Entero inválido: ${key}`);
      }
      if (row.currency && !/^[A-Z]{3}$/.test(String(row.currency)))
        throw new Error("Moneda inválida");
      for (const key of ["date", "bookingDate", "anchorDate", "nextDate"])
        if (
          row[key] &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(String(row[key])) ||
            !Number.isFinite(Date.parse(String(row[key]))))
        )
          throw new Error("Fecha inválida");
      for (const key of ["date", "bookingDate", "anchorDate", "nextDate"])
        if (row[key]) parseDate(row[key], "YMD");
      if (row.aiSuggestion !== undefined) {
        const suggestion = row.aiSuggestion as Record<string, unknown>;
        if (
          !suggestion ||
          typeof suggestion !== "object" ||
          typeof suggestion.categoryId !== "string" ||
          typeof suggestion.score !== "number" ||
          !Number.isFinite(suggestion.score) ||
          Math.abs(suggestion.score) > 1.001
        )
          throw new Error("Sugerencia inválida");
      }
      if (
        row.movementIds &&
        (!Array.isArray(row.movementIds) ||
          row.movementIds.some((id) => typeof id !== "string") ||
          new Set(row.movementIds).size !== row.movementIds.length)
      )
        throw new Error("Relaciones inválidas");
      if (
        table === "locations" &&
        (Math.abs(Number(row.lat)) > 90 ||
          Math.abs(Number(row.lng)) > 180 ||
          !Number.isFinite(Date.parse(String(row.start))) ||
          !Number.isFinite(Date.parse(String(row.end))) ||
          String(row.end) < String(row.start))
      )
        throw new Error("Ubicación inválida");
      if (
        table === "recurrences" &&
        !["weekly", "monthly", "yearly"].includes(String(row.frequency))
      )
        throw new Error("Periodicidad inválida");
      if (
        table === "relations" &&
        !["transfer", "refund", "related"].includes(String(row.type))
      )
        throw new Error("Relación inválida");
      if (
        table === "movements" &&
        !["manual", "rule", "ai", "none"].includes(String(row.categorySource))
      )
        throw new Error("Origen de categoría inválido");
      if (
        table === "assignments" &&
        !["suggested", "confirmed"].includes(String(row.status))
      )
        throw new Error("Estado geográfico inválido");
      if (table === "categories" && !/^#[\da-f]{6}$/i.test(String(row.color)))
        throw new Error("Color inválido");
      if (table === "profiles") {
        if (
          !["DMY", "MDY", "YMD"].includes(String(row.dateFormat)) ||
          ![",", "."].includes(String(row.decimal)) ||
          !Number.isInteger(row.headerRow) ||
          Number(row.headerRow) < 0
        )
          throw new Error("Perfil inválido");
        const cols = row.columns as Record<string, unknown>;
        if (
          cols.balance !== undefined &&
          (!Number.isInteger(cols.balance) || Number(cols.balance) < -1)
        )
          throw new Error("Columna de saldo inválida");
        if (
          [
            "date",
            "description",
            "amount",
            "debit",
            "credit",
            "merchant",
            "externalId",
          ].some((k) => !Number.isInteger(cols[k]) || Number(cols[k]) < -1)
        )
          throw new Error("Columnas inválidas");
      }
    }
  }
  const s = data as unknown as Snapshot;
  const accountIds = new Set(s.accounts.map((a) => a.id)),
    categoryIds = new Set(s.categories.map((c) => c.id)),
    movementIds = new Set(s.movements.map((m) => m.id)),
    locationIds = new Set(s.locations.map((l) => l.id));
  for (const setting of s.settings) {
    if (
      setting.cpuThreads !== undefined &&
      setting.cpuThreads !== "auto" &&
      (!Number.isInteger(setting.cpuThreads) ||
        setting.cpuThreads < 1 ||
        setting.cpuThreads > 8)
    )
      throw new Error("Ajuste de hilos CPU no válido");
    for (const key of ["hideImportWelcome", "hideTanuWelcome"] as const) {
      if (setting[key] !== undefined && typeof setting[key] !== "boolean")
        throw new Error("Preferencia de bienvenida no válida");
    }
  }
  if (s.settings.length !== 1 || s.settings[0].id !== "main")
    throw new Error("Ajustes inválidos");
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: s.settings[0].timezone });
  } catch {
    throw new Error("Zona horaria inválida");
  }
  for (const m of s.movements)
    if (
      !accountIds.has(m.accountId) ||
      (m.categoryId && !categoryIds.has(m.categoryId))
    )
      throw new Error("Movimiento con referencia inexistente");
  validateCategoryTree(s.categories);
  const tagIds = new Set(s.tags.map((t) => t.id)),
    tagNames = new Set<string>();
  for (const tag of s.tags) {
    const expected = makeTag(tag.name, tag.id).normalizedName;
    if (tag.normalizedName !== expected || tagNames.has(expected))
      throw new Error("Etiqueta duplicada o nombre normalizado inválido");
    tagNames.add(expected);
  }
  for (const movement of s.movements)
    if (
      !Array.isArray(movement.tagIds) ||
      movement.tagIds.some((id) => typeof id !== "string" || !tagIds.has(id)) ||
      new Set(movement.tagIds).size !== movement.tagIds.length
    )
      throw new Error("Etiquetas de movimiento inválidas");
  for (const r of s.rules)
    if (
      (r.accountId && !accountIds.has(r.accountId)) ||
      (r.categoryId && !categoryIds.has(r.categoryId))
    )
      throw new Error("Regla con referencia inexistente");
  for (const r of s.recurrences)
    if (
      !accountIds.has(r.accountId) ||
      r.movementIds.some((id) => !movementIds.has(id))
    )
      throw new Error("Recurrencia con referencia inexistente");
  for (const r of s.relations)
    if (
      r.movementIds.length < 2 ||
      r.movementIds.some((id) => !movementIds.has(id))
    )
      throw new Error("Relación con referencia inexistente");
  const linked = new Set<string>();
  for (const r of s.relations) {
    validateRelation(
      r.type,
      s.movements.filter((m) => r.movementIds.includes(m.id)),
    );
    if (r.type !== "related")
      for (const id of r.movementIds) {
        if (linked.has(id))
          throw new Error(
            "Un movimiento tiene relaciones contables incompatibles",
          );
        linked.add(id);
      }
  }
  for (const m of s.movements)
    if (
      m.currency !== s.accounts.find((a) => a.id === m.accountId)?.currency ||
      (m.aiSuggestion && !categoryIds.has(m.aiSuggestion.categoryId))
    )
      throw new Error("Moneda o sugerencia incompatible con el movimiento");
  for (const a of s.assignments)
    if (!movementIds.has(a.movementId) || !locationIds.has(a.locationId))
      throw new Error("Ubicación con referencia inexistente");
  return s;
}
export async function exportBackup() {
  return JSON.stringify(
    {
      app: "Tanukoin",
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      data: await readSnapshot(),
    },
    null,
    2,
  );
}
export async function restoreBackup(input: unknown) {
  const data = validateBackup(input);
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const name of tables) await db.table(name).bulkPut(data[name]);
    // A restored file cannot consent to networking on the user's behalf.
    await db.settings.update("main", {
      maps: false,
      search: false,
      banking: false,
    });
  });
}
export function download(
  name: string,
  content: BlobPart,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+@\t\r-]/.test(text) && !/^[-+]?\d+(?:[,.]\d+)?$/.test(text))
    text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};
