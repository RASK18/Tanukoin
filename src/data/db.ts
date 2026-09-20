import Dexie, { type EntityTable } from "dexie";
import type {
  Account,
  Movement,
  Category,
  Rule,
  Recurrence,
  Relation,
  Location,
  Assignment,
  ImportProfile,
  Settings,
  SearchCache,
  ModelState,
  Embedding,
  Snapshot,
} from "./types";

export const db = new Dexie("tanukoin") as Dexie & {
  accounts: EntityTable<Account, "id">;
  movements: EntityTable<Movement, "id">;
  categories: EntityTable<Category, "id">;
  rules: EntityTable<Rule, "id">;
  recurrences: EntityTable<Recurrence, "id">;
  relations: EntityTable<Relation, "id">;
  locations: EntityTable<Location, "id">;
  assignments: EntityTable<Assignment, "id">;
  profiles: EntityTable<ImportProfile, "id">;
  settings: EntityTable<Settings, "id">;
  searchCache: EntityTable<SearchCache, "id">;
  models: EntityTable<ModelState, "id">;
  embeddings: EntityTable<Embedding, "id">;
};
db.version(1).stores({
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
export const defaultCategories: Category[] = [
  [
    "home",
    "Vivienda",
    "#577fa2",
    "House",
    "Alquiler, hipoteca, electricidad, agua, gas, internet y hogar",
  ],
  [
    "food",
    "Alimentación",
    "#d29858",
    "ShoppingBasket",
    "Supermercado, panadería, frutería, compra de comida",
  ],
  [
    "transport",
    "Transporte",
    "#699e9a",
    "TrainFront",
    "Gasolina, combustible, autobús, metro, tren, taxi y aparcamiento",
  ],
  [
    "restaurants",
    "Restaurantes",
    "#c97560",
    "Utensils",
    "Restaurante, cafetería, bar y comida a domicilio",
  ],
  [
    "leisure",
    "Ocio",
    "#9b87b1",
    "Gamepad2",
    "Cine, videojuegos, conciertos, libros y entretenimiento",
  ],
  [
    "health",
    "Salud",
    "#849c6c",
    "HeartPulse",
    "Farmacia, médico, dentista, gimnasio y salud",
  ],
  [
    "shopping",
    "Compras",
    "#ba879a",
    "ShoppingBag",
    "Ropa, electrónica y compras personales",
  ],
  [
    "income",
    "Ingresos",
    "#488766",
    "Wallet",
    "Nómina, salario, ingresos y trabajo",
  ],
  [
    "other",
    "Otros",
    "#9ba39d",
    "Ellipsis",
    "Otros movimientos sin categoría específica",
  ],
].map(([id, name, color, icon, description]) => ({
  id,
  name,
  color,
  icon,
  description,
}));
export async function initialize() {
  await db.transaction("rw", [db.categories, db.settings], async () => {
    if (!(await db.settings.get("main"))) {
      await db.categories.bulkPut(defaultCategories);
      await db.settings.put({
        id: "main",
        maps: false,
        search: false,
        banking: false,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid",
      });
    }
  });
}
export async function readSnapshot(): Promise<Snapshot> {
  return db.transaction(
    "r",
    [
      db.accounts,
      db.movements,
      db.categories,
      db.rules,
      db.recurrences,
      db.relations,
      db.locations,
      db.assignments,
      db.profiles,
      db.settings,
    ],
    async () => ({
      accounts: await db.accounts.toArray(),
      movements: await db.movements.toArray(),
      categories: await db.categories.toArray(),
      rules: await db.rules.toArray(),
      recurrences: await db.recurrences.toArray(),
      relations: await db.relations.toArray(),
      locations: await db.locations.toArray(),
      assignments: await db.assignments.toArray(),
      profiles: await db.profiles.toArray(),
      settings: await db.settings.toArray(),
    }),
  );
}
export async function removeMovements(ids: string[]) {
  const selected = new Set(ids);
  await db.transaction(
    "rw",
    [db.movements, db.relations, db.recurrences, db.assignments, db.embeddings],
    async () => {
      await db.movements.bulkDelete(ids);
      await db.embeddings.bulkDelete(ids);
      await db.assignments.where("movementId").anyOf(ids).delete();
      for (const relation of await db.relations.toArray())
        if (relation.movementIds.some((id) => selected.has(id)))
          await db.relations.delete(relation.id);
      for (const recurrence of await db.recurrences.toArray())
        await db.recurrences.update(recurrence.id, {
          movementIds: recurrence.movementIds.filter((id) => !selected.has(id)),
        });
    },
  );
}
