import Dexie from "dexie";
import { beforeEach, expect, it, vi } from "vitest";
import { db, initialize, readSnapshot } from "../src/data/db";
import type { Category, Movement, Rule } from "../src/data/types";
import {
  assignCategory,
  moveCategory,
  updateCategoryDetails,
  changeTags,
  deleteCategoryBranch,
  deleteTag,
  deletionImpact,
  saveCategory,
  saveEditedMovement,
  saveTag,
  validAutomaticCategory,
} from "../src/data/classification";
import {
  categoryTree,
  makeTag,
  matchesTags,
  movementSearchText,
  validateCategoryTree,
} from "../src/lib/classification";
import { applyRules } from "../src/lib/finance";
import { exportBackup, restoreBackup, validateBackup } from "../src/lib/backup";
import { executeQuery, validateQuery } from "../src/features/ai/queries";
import {
  completeDraft,
  normalizeDraft,
  readDraft,
} from "../src/features/ai/query-intent";

const cat = (id: string, name: string, parentId?: string): Category => ({
  id,
  name,
  parentId,
  color: "#699e9a",
  icon: "Folder",
  description: "",
});
const categories = [
  cat("trip", "Viajes"),
  cat("transport", "Transporte", "trip"),
  cat("flight", "Vuelos", "transport"),
  cat("international", "Internacional", "flight"),
  cat("home", "Vivienda"),
  cat("local", "Transporte"),
];
const movement = (
  id: string,
  categoryId = "flight",
  tagIds = ["japan"],
): Movement => ({
  id,
  categoryId,
  categorySource: "rule",
  tagIds,
  accountId: "a",
  amount: -10000,
  currency: "EUR",
  description: "Compra ficticia",
  merchant: "",
  date: "2026-09-10",
  notes: "",
  source: "fixture",
  fingerprint: id,
  createdAt: "2026-09-10",
});
const rule: Rule = {
  id: "r",
  name: "Vuelos",
  enabled: true,
  priority: 1,
  descriptionContains: "",
  merchantContains: "",
  categoryId: "flight",
  note: "Nota de regla",
};

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
  await db.open();
  await initialize();
  await db.categories.clear();
  await db.categories.bulkAdd(categories);
  await db.tags.bulkAdd([
    makeTag("Vacaciones Japón", "japan"),
    makeTag("Laura", "laura"),
  ]);
  await db.accounts.add({
    id: "a",
    name: "Principal",
    bank: "",
    currency: "EUR",
  });
});

it("admite profundidad libre, rutas completas y agrupaciones disjuntas", () => {
  const tree = categoryTree(categories);
  expect(tree.path("international")).toBe(
    "Viajes → Transporte → Vuelos → Internacional",
  );
  expect([...tree.branch("trip")].sort()).toEqual([
    "flight",
    "international",
    "transport",
    "trip",
  ]);
  expect(tree.group("international")).toBe("trip");
  expect(tree.group("international", "trip")).toBe("transport");
  expect(tree.group("trip", "trip")).toBe("trip");
  const deep = Array.from({ length: 150 }, (_, i) =>
    cat(`${i}`, `${i}`, i ? `${i - 1}` : undefined),
  );
  expect(() => validateCategoryTree(deep)).not.toThrow();
  expect(categoryTree(deep).ancestors("149")).toHaveLength(150);
});

it("mueve una rama conservando asignaciones y rechaza ciclos o padres inexistentes", async () => {
  await db.movements.add(movement("m", "international"));
  await saveCategory({ ...categories[1], parentId: "home" });
  expect(
    categoryTree(await db.categories.toArray()).path("international"),
  ).toBe("Vivienda → Transporte → Vuelos → Internacional");
  expect((await db.movements.get("m"))?.categoryId).toBe("international");
  await expect(
    saveCategory({ ...categories[4], parentId: "international" }),
  ).rejects.toThrow("descendientes");
  await expect(
    saveCategory(cat("bad", "Nueva", "missing"), true),
  ).rejects.toThrow("padre");
  await expect(
    saveCategory({ ...categories[0], parentId: "trip" }),
  ).rejects.toThrow("descendientes");
});

it("distingue nombres de ramas diferentes y evita duplicados entre hermanos", async () => {
  await saveCategory(cat("other", "Vuelos", "home"), true);
  await expect(
    saveCategory(cat("duplicate", "  VUÉLOS ", "transport"), true),
  ).rejects.toThrow("Ya existe");
  await db.movements.add(movement("m"));
  await assignCategory(["m"], "trip");
  expect(await db.movements.get("m")).toMatchObject({
    categoryId: "trip",
    categorySource: "manual",
  });
});

it("elimina la rama, reglas y sugerencias conservando movimientos y etiquetas", async () => {
  await db.movements.bulkAdd([
    movement("m"),
    {
      ...movement("other", "home"),
      aiSuggestion: { categoryId: "international", score: 0.5 },
    },
  ]);
  await db.rules.add(rule);
  await db.embeddings.put({
    id: "category:flight",
    text: "Vuelos",
    model: "ficticio",
    vector: [1],
  });
  const impact = deletionImpact(
    "trip",
    await db.categories.toArray(),
    await db.movements.toArray(),
    await db.rules.toArray(),
  );
  expect(impact).toMatchObject({ movementIds: ["m"], ruleIds: ["r"] });
  await deleteCategoryBranch("trip", impact);
  const m = (await db.movements.get("m"))!;
  expect(m.categoryId).toBeUndefined();
  expect(m.categorySource).toBe("manual");
  expect(m.tagIds).toEqual(["japan"]);
  expect(applyRules(m, [rule])).toEqual(m);
  expect((await db.movements.get("other"))?.categoryId).toBe("home");
  expect((await db.movements.get("other"))?.aiSuggestion).toBeUndefined();
  expect(await db.rules.count()).toBe(0);
  expect(await db.embeddings.count()).toBe(0);
  expect(await db.categories.count()).toBe(2);
});

it("revierte toda la eliminación si falla y pide revisar si cambia el alcance", async () => {
  await db.movements.add(movement("m"));
  await db.rules.add(rule);
  const before = await readSnapshot(),
    impact = deletionImpact(
      "trip",
      before.categories,
      before.movements,
      before.rules,
    );
  vi.spyOn(db.categories, "bulkDelete").mockRejectedValueOnce(
    new Error("fallo ficticio"),
  );
  await expect(deleteCategoryBranch("trip", impact)).rejects.toThrow(
    "fallo ficticio",
  );
  expect(await readSnapshot()).toEqual(before);
  await db.movements.add(movement("new"));
  await expect(deleteCategoryBranch("trip", impact)).rejects.toThrow(
    "datos han cambiado",
  );
  expect(await db.categories.get("trip")).toBeDefined();
});

it("reutiliza etiquetas equivalentes, renombra y elimina solo la etiqueta elegida", async () => {
  await expect(
    saveTag(makeTag(" vacaciones  JAPON ", "duplicate"), true),
  ).rejects.toThrow("Ya existe");
  await db.movements.add(movement("m", "flight", ["japan", "laura"]));
  await saveTag(makeTag("Japón 2026", "japan"));
  expect((await db.movements.get("m"))?.tagIds).toEqual(["japan", "laura"]);
  await deleteTag("japan");
  expect(await db.movements.get("m")).toMatchObject({
    categoryId: "flight",
    tagIds: ["laura"],
  });
});

it("añade y retira etiquetas en lote sin reemplazar otras ni el origen de categoría", async () => {
  await db.movements.bulkAdd([movement("a"), movement("b", "transport", [])]);
  await changeTags(["a", "b"], ["laura"], "add");
  await changeTags(["a", "b"], ["laura"], "add");
  expect((await db.movements.get("a"))?.tagIds).toEqual(["japan", "laura"]);
  await changeTags(["a", "b"], ["japan"], "remove");
  expect(await db.movements.get("a")).toMatchObject({
    tagIds: ["laura"],
    categorySource: "rule",
  });
});

it("guarda nuevas etiquetas junto al movimiento y no convierte su categoría en manual", async () => {
  const m = movement("m");
  await db.movements.add(m);
  await saveEditedMovement({ ...m, tagIds: ["pending"] }, false, [
    makeTag(" VACACIONES JAPON ", "pending"),
  ]);
  expect(await db.tags.count()).toBe(2);
  expect(await db.movements.get("m")).toMatchObject({
    categorySource: "rule",
    tagIds: ["japan"],
  });
  await expect(
    saveEditedMovement({ ...m, categoryId: "missing", tagIds: ["new"] }, true, [
      makeTag("Nueva", "new"),
    ]),
  ).rejects.toThrow("categoría ya no existe");
  expect(await db.tags.get("new")).toBeUndefined();
});

it("un editor abierto y una respuesta automática tardía no resucitan referencias eliminadas", async () => {
  const old = movement("m");
  await db.movements.add(old);
  await deleteCategoryBranch(
    "trip",
    deletionImpact("trip", categories, [old], []),
  );
  await saveEditedMovement({ ...old, notes: "Nueva nota" }, false, []);
  expect(await db.movements.get("m")).toMatchObject({
    categorySource: "manual",
    notes: "Nueva nota",
  });
  expect((await db.movements.get("m"))?.categoryId).toBeUndefined();
  const sanitized = validAutomaticCategory(
    { ...old, aiSuggestion: { categoryId: "flight", score: 0.9 } },
    new Set(["home"]),
  );
  expect(sanitized.categoryId).toBeUndefined();
  expect(sanitized.aiSuggestion).toBeUndefined();
  expect(sanitized.tagIds).toEqual(["japan"]);
  await deleteTag("japan");
  await expect(saveEditedMovement(old, false, [])).rejects.toThrow(
    "etiqueta ya no existe",
  );
});

it("busca por todos los antecesores y etiquetas y distingue filtros todas/cualquiera/sin", async () => {
  const m = movement("m", "international");
  const text = movementSearchText(
    m,
    categoryTree(categories),
    await db.tags.toArray(),
  );
  expect(text).toContain("viajes");
  expect(text).toContain("vacaciones japon");
  expect(matchesTags(m, ["japan", "laura"], "all")).toBe(false);
  expect(matchesTags(m, ["japan", "laura"], "any")).toBe(true);
  expect(matchesTags(m, [], "none")).toBe(false);
  expect(matchesTags({ tagIds: [] }, [], "none")).toBe(true);
});

it("calcula ramas completas por moneda con devoluciones y sin transferencias ni doble conteo", async () => {
  await db.accounts.add({
    id: "usd",
    name: "Dólares",
    bank: "",
    currency: "USD",
  });
  await db.movements.bulkAdd([
    movement("leaf", "international"),
    movement("direct", "trip"),
    { ...movement("refund", "home"), amount: 2000 },
    {
      ...movement("usd", "flight"),
      currency: "USD",
      accountId: "usd",
      amount: -5000,
    },
    movement("transfer", "flight"),
    { ...movement("other-transfer", "flight"), amount: 10000 },
  ]);
  await db.relations.bulkAdd([
    { id: "refund", type: "refund", movementIds: ["leaf", "refund"] },
    {
      id: "transfer",
      type: "transfer",
      movementIds: ["transfer", "other-transfer"],
    },
  ]);
  const data = await readSnapshot();
  const result = executeQuery(
    { op: "sum", categoryId: "trip", tagIds: ["japan"] },
    data,
  );
  expect(result.text).toContain("180,00");
  expect(result.text).toContain("50,00");
  expect(result.rows).toHaveLength(4);
  const grouped = executeQuery(
    { op: "group", categoryId: "trip", direction: "expense", currency: "EUR" },
    data,
  );
  expect(grouped.text).toContain("Viajes → Transporte: 80,00");
  expect(grouped.text).toContain("Asignados directamente: 100,00");
  expect(
    executeQuery({ op: "search", categoryId: "trip", tagMode: "none" }, data)
      .rows,
  ).toHaveLength(0);
});

it("Tanu resuelve rutas, pide aclaración en nombres ambiguos y conserva filtros de etiquetas", async () => {
  const data = await readSnapshot();
  const ambiguous = normalizeDraft(
    { op: "search", category: "Transporte" },
    data,
    "2026-09-23",
  );
  expect(ambiguous).toMatchObject({ op: "clarify" });
  expect(JSON.stringify(ambiguous)).toContain("Viajes → Transporte");
  expect(
    normalizeDraft(
      {
        op: "search",
        category: "Viajes → Transporte",
        tags: ["vacaciones japon"],
      },
      data,
      "2026-09-23",
    ),
  ).toMatchObject({ categoryId: "transport", tagIds: ["japan"] });
  const previous = readDraft({ op: "search", tags: ["Laura"], tagMode: "all" });
  expect(completeDraft({ op: "sum" }, previous).tags).toEqual(["Laura"]);
  expect(
    completeDraft({ op: "search", clear: ["tags"] }, previous).tags,
  ).toBeUndefined();
  expect(() =>
    validateQuery({ op: "search", tagIds: ["missing"] }, data),
  ).toThrow();
  expect(() => readDraft({ op: "search", tags: "Laura" })).toThrow();
  expect(
    validateQuery({ op: "recurrences", tagIds: ["laura"] }, data),
  ).toMatchObject({ op: "clarify" });
});

it("restaura árboles profundos y etiquetas y rechaza copias inválidas sin alterar datos", async () => {
  await db.movements.add(movement("m", "international"));
  const raw = JSON.parse(await exportBackup());
  expect(raw.schemaVersion).toBe(2);
  await restoreBackup(raw);
  expect(await readSnapshot()).toEqual(raw.data);
  for (const mutate of [
    (copy: any) => {
      copy.schemaVersion = 1;
    },
    (copy: any) => {
      copy.data.categories[0].parentId = "international";
    },
    (copy: any) => {
      copy.data.movements[0].tagIds = ["missing"];
    },
    (copy: any) => {
      copy.data.movements[0].tagIds = ["japan", "japan"];
    },
    (copy: any) => {
      copy.data.tags.push({ ...copy.data.tags[0], id: "duplicate" });
    },
  ]) {
    const invalid = structuredClone(raw);
    mutate(invalid);
    expect(() => validateBackup(invalid)).toThrow();
    await expect(restoreBackup(invalid)).rejects.toThrow();
    expect(await readSnapshot()).toEqual(raw.data);
  }
});

it("actualiza una base del esquema 1 conservando movimientos, categorías, preferencias y modelos", async () => {
  await db.delete();
  const old = new Dexie("tanukoin");
  old.version(1).stores({
    accounts: "id,externalId",
    movements:
      "id,accountId,date,categoryId,fingerprint,[accountId+externalId],importId",
    categories: "id,parentId",
    rules: "id,priority",
    recurrences: "id,nextDate",
    relations: "id,*movementIds",
    locations: "id,start,end",
    assignments: "id,movementId,locationId",
    profiles: "id",
    settings: "id",
    searchCache: "id",
    models: "id",
    embeddings: "id",
  });
  await old.open();
  const { tagIds, ...legacy } = movement("old");
  await old.table("movements").put(legacy);
  await old.table("categories").bulkPut(categories);
  await old.table("settings").put({
    id: "main",
    timezone: "Europe/Madrid",
    maps: false,
    search: false,
    banking: false,
    hideImportWelcome: true,
  });
  await old.table("models").put({
    id: "embeddings",
    ready: true,
    revision: "fixture",
    savedAt: "2026-09-23",
  });
  old.close();
  await db.open();
  await initialize();
  expect(await db.movements.get("old")).toEqual({ ...legacy, tagIds: [] });
  expect(await db.categories.count()).toBe(categories.length);
  expect((await db.settings.get("main"))?.hideImportWelcome).toBe(true);
  expect((await db.models.get("embeddings"))?.ready).toBe(true);
  expect(await db.tags.count()).toBe(0);
});

it("ordena, cambia de padre y promueve ramas sin alterar movimientos ni reglas", async () => {
  await db.movements.add(movement("m"));
  await db.rules.add(rule);
  await moveCategory("home", { targetId: "local", position: "before" });
  expect(
    categoryTree(await db.categories.toArray())
      .children.get("")
      ?.map((c) => c.id),
  ).toEqual(["home", "local", "trip"]);
  await moveCategory("transport", { targetId: "home", position: "inside" });
  expect(categoryTree(await db.categories.toArray()).path("flight")).toBe(
    "Vivienda → Transporte → Vuelos",
  );
  await moveCategory("flight", { position: "inside" });
  expect((await db.categories.get("flight"))?.parentId).toBeUndefined();
  expect((await db.categories.get("international"))?.parentId).toBe("flight");
  expect(await db.movements.get("m")).toEqual(movement("m"));
  expect(await db.rules.get("r")).toEqual(rule);
  await updateCategoryDetails("transport", {
    name: "Movilidad",
    icon: "🚲",
    color: "#123456",
  });
  expect(await db.categories.get("transport")).toMatchObject({
    parentId: "home",
    name: "Movilidad",
    icon: "🚲",
  });
  const backup = JSON.parse(await exportBackup());
  const restored = validateBackup(backup);
  expect(
    categoryTree(restored.categories)
      .children.get("")
      ?.map((c) => c.id),
  ).toEqual(["home", "local", "trip", "flight"]);
  await restoreBackup(backup);
  expect(await db.categories.get("transport")).toMatchObject({
    parentId: "home",
    icon: "🚲",
  });
  expect(
    categoryTree(await db.categories.toArray())
      .children.get("")
      ?.map((c) => c.id),
  ).toEqual(["home", "local", "trip", "flight"]);
  const bad = structuredClone(backup);
  bad.data.categories[0].order = "bad" as unknown as number;
  expect(() => validateBackup(bad)).toThrow("Entero inválido");
});

it("rechaza destinos cíclicos, ausentes y duplicados sin modificar el orden", async () => {
  const before = await db.categories.toArray();
  await expect(
    moveCategory("trip", { targetId: "international", position: "inside" }),
  ).rejects.toThrow("propia rama");
  await expect(
    moveCategory("trip", { targetId: "trip", position: "after" }),
  ).rejects.toThrow("propia rama");
  await expect(
    moveCategory("transport", { position: "inside" }),
  ).rejects.toThrow("Ya existe");
  await expect(
    moveCategory("trip", { targetId: "missing", position: "before" }),
  ).rejects.toThrow("ya no existe");
  expect(await db.categories.toArray()).toEqual(before);
});
