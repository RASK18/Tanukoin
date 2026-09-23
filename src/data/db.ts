import { defaultCategories } from "./default-categories";
import Dexie, { type EntityTable } from "dexie";
import type {
  Account,
  Movement,
  Category,
  Tag,
  Rule,
  Recurrence,
  Relation,
  Location,
  Assignment,
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
  tags: EntityTable<Tag, "id">;
  rules: EntityTable<Rule, "id">;
  recurrences: EntityTable<Recurrence, "id">;
  relations: EntityTable<Relation, "id">;
  locations: EntityTable<Location, "id">;
  assignments: EntityTable<Assignment, "id">;
  settings: EntityTable<Settings, "id">;
  searchCache: EntityTable<SearchCache, "id">;
  models: EntityTable<ModelState, "id">;
  embeddings: EntityTable<Embedding, "id">;
};
db.version(3).stores({
  accounts: "id,externalId",
  movements:
    "id,accountId,date,categoryId,*tagIds,fingerprint,[accountId+externalId],importId",
  categories: "id,parentId",
  tags: "id,&normalizedName",
  rules: "id,priority",
  recurrences: "id,nextDate",
  relations: "id,*movementIds",
  locations: "id,start,end",
  assignments: "id,movementId,locationId",
  settings: "id",
  searchCache: "id",
  models: "id",
  embeddings: "id",
});
export { defaultCategories } from "./default-categories";
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
      db.tags,
      db.rules,
      db.recurrences,
      db.relations,
      db.locations,
      db.assignments,
      db.settings,
    ],
    async () => ({
      accounts: await db.accounts.toArray(),
      movements: await db.movements.toArray(),
      categories: await db.categories.toArray(),
      tags: await db.tags.toArray(),
      rules: await db.rules.toArray(),
      recurrences: await db.recurrences.toArray(),
      relations: await db.relations.toArray(),
      locations: await db.locations.toArray(),
      assignments: await db.assignments.toArray(),
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
