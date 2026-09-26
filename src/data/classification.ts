import { importFields } from "../features/import/reconcile";
import { db } from "./db";
import type { Category, Movement, Rule, Tag } from "./types";
import {
  categoryTree,
  makeTag,
  validateCategoryTree,
} from "../lib/classification";
import {
  normalize,
  validateRelation,
  validateOriginalAmount,
  validateMovementCosts,
  validateMovementDates,
  fingerprint,
} from "../lib/finance";
import { sanitizeMovementText } from "../lib/movement-text";
import {
  detachMovementOrder,
  reconcileMovementOrder,
} from "../lib/movement-order";

export async function saveCategory(category: Category, creating = false) {
  await db.transaction("rw", db.categories, async () => {
    const categories = await db.categories.toArray();
    if (!creating && !categories.some((c) => c.id === category.id))
      throw new Error(
        "La categoría ya no existe. Cierra y vuelve a abrir el editor.",
      );
    const next = {
      ...category,
      name: category.name.trim().replace(/\s+/g, " "),
    };
    if (!next.name) throw new Error("Escribe un nombre para la categoría.");
    if (
      categories.some(
        (c) =>
          c.id !== next.id &&
          (c.parentId || "") === (next.parentId || "") &&
          normalize(c.name) === normalize(next.name),
      )
    )
      throw new Error("Ya existe una categoría con ese nombre en este nivel.");
    validateCategoryTree([...categories.filter((c) => c.id !== next.id), next]);
    await db.categories.put(next);
  });
}

/** Patch only the edited fields, preserving a concurrent move or description edit. */
export async function updateCategoryDetails(
  id: string,
  changes: Partial<Pick<Category, "name" | "icon" | "color" | "description">>,
) {
  await db.transaction("rw", db.categories, async () => {
    const current = await db.categories.get(id);
    if (!current) throw new Error("La categoría ya no existe.");
    await saveCategory({ ...current, ...changes });
  });
}

export type CategoryDrop = {
  targetId?: string;
  position: "before" | "after" | "inside";
};
export async function moveCategory(id: string, drop: CategoryDrop) {
  await db.transaction("rw", db.categories, async () => {
    const categories = await db.categories.toArray();
    const tree = categoryTree(categories);
    const current = tree.byId.get(id),
      target = drop.targetId ? tree.byId.get(drop.targetId) : undefined;
    if (!current || (drop.targetId && !target))
      throw new Error("La categoría ya no existe.");
    if (target && tree.branch(id).has(target.id))
      throw new Error(
        "No puedes mover una categoría dentro de su propia rama.",
      );
    const parentId = drop.position === "inside" ? target?.id : target?.parentId;
    const siblings = (tree.children.get(parentId || "") || []).filter(
      (c) => c.id !== id,
    );
    if (siblings.some((c) => normalize(c.name) === normalize(current.name)))
      throw new Error("Ya existe una categoría con ese nombre en este nivel.");
    const next = { ...current, parentId };
    validateCategoryTree([...categories.filter((c) => c.id !== id), next]);
    const index =
      target && drop.position !== "inside"
        ? siblings.findIndex((c) => c.id === target.id) +
          (drop.position === "after" ? 1 : 0)
        : siblings.length;
    siblings.splice(index, 0, next);
    await db.categories.bulkPut(siblings.map((c, order) => ({ ...c, order })));
  });
}

export function deletionImpact(
  id: string,
  categories: Category[],
  movements: Movement[],
  rules: Rule[],
) {
  const ids = categoryTree(categories).branch(id);
  return {
    categoryIds: [...ids].sort(),
    movementIds: movements
      .filter((m) => m.categoryId && ids.has(m.categoryId))
      .map((m) => m.id)
      .sort(),
    ruleIds: rules
      .filter((r) => r.categoryId && ids.has(r.categoryId))
      .map((r) => r.id)
      .sort(),
  };
}

export async function deleteCategoryBranch(
  id: string,
  expected: ReturnType<typeof deletionImpact>,
) {
  await db.transaction(
    "rw",
    [db.categories, db.movements, db.rules, db.embeddings],
    async () => {
      const categories = await db.categories.toArray(),
        movements = await db.movements.toArray();
      const impact = deletionImpact(
        id,
        categories,
        movements,
        await db.rules.toArray(),
      );
      if (JSON.stringify(impact) !== JSON.stringify(expected))
        throw new Error(
          "Los datos han cambiado. Revisa de nuevo el alcance antes de eliminar.",
        );
      const ids = new Set(impact.categoryIds);
      for (const m of movements) {
        const assigned = !!m.categoryId && ids.has(m.categoryId);
        const suggested =
          !!m.aiSuggestion && ids.has(m.aiSuggestion.categoryId);
        if (assigned || suggested)
          await db.movements.update(m.id, {
            ...(assigned
              ? { categoryId: undefined, categorySource: "manual" as const }
              : {}),
            aiSuggestion: undefined,
          });
      }
      await db.rules.bulkDelete(impact.ruleIds);
      await db.embeddings.bulkDelete(
        impact.categoryIds.map((cid) => `category:${cid}`),
      );
      await db.categories.bulkDelete(impact.categoryIds);
    },
  );
}

export async function saveTag(tag: Tag, creating = false) {
  await db.transaction("rw", db.tags, async () => {
    if (!creating && !(await db.tags.get(tag.id)))
      throw new Error("La etiqueta ya no existe.");
    const next = makeTag(tag.name, tag.id);
    const existing = await db.tags
      .where("normalizedName")
      .equals(next.normalizedName)
      .first();
    if (existing && existing.id !== tag.id)
      throw new Error(`Ya existe la etiqueta «${existing.name}».`);
    await db.tags.put(next);
  });
}

export async function deleteTag(id: string) {
  await db.transaction("rw", [db.tags, db.movements], async () => {
    await db.movements
      .where("tagIds")
      .equals(id)
      .modify((m) => {
        m.tagIds = m.tagIds.filter((tagId) => tagId !== id);
      });
    await db.tags.delete(id);
  });
}

export async function assignCategory(ids: string[], categoryId: string) {
  await db.transaction("rw", [db.categories, db.movements], async () => {
    if (categoryId && !(await db.categories.get(categoryId)))
      throw new Error("La categoría ya no existe.");
    for (const id of ids)
      await db.movements.update(id, {
        categoryId: categoryId || undefined,
        categorySource: "manual",
        aiSuggestion: undefined,
      });
  });
}

export async function changeTags(
  ids: string[],
  tagIds: string[],
  action: "add" | "remove",
) {
  await db.transaction("rw", [db.tags, db.movements], async () => {
    for (const id of tagIds)
      if (!(await db.tags.get(id)))
        throw new Error("Una etiqueta ya no existe. Revisa la selección.");
    for (const id of ids) {
      const movement = await db.movements.get(id);
      if (movement)
        await db.movements.update(id, {
          tagIds:
            action === "add"
              ? [...new Set([...movement.tagIds, ...tagIds])]
              : movement.tagIds.filter((tag) => !tagIds.includes(tag)),
        });
    }
  });
}

export async function saveEditedMovement(
  movement: Movement,
  categoryChanged: boolean,
  pendingTags: Tag[],
) {
  await db.transaction(
    "rw",
    [db.movements, db.categories, db.tags, db.relations, db.embeddings],
    async () => {
      const current = await db.movements.get(movement.id);
      if (!current) throw new Error("El movimiento ya no existe.");
      const next = {
        ...movement,
        ...sanitizeMovementText(movement),
        order: current.order,
        sourcePosition: current.sourcePosition,
        categoryId: categoryChanged ? movement.categoryId : current.categoryId,
        categorySource: categoryChanged
          ? ("manual" as const)
          : current.categorySource,
        aiSuggestion: categoryChanged ? undefined : current.aiSuggestion,
      };
      next.manualFields = [
        ...new Set([
          ...(current.manualFields || []),
          ...importFields.filter((field) => next[field] !== current[field]),
        ]),
      ];
      if (
        next.description !== current.description ||
        next.reference !== current.reference ||
        next.merchant !== current.merchant
      )
        await db.embeddings.delete(next.id);
      validateOriginalAmount(next);
      validateMovementCosts(next);
      validateMovementDates(next);
      next.fingerprint = fingerprint(next);
      if (next.categoryId && !(await db.categories.get(next.categoryId)))
        throw new Error("La categoría ya no existe. Elige otra categoría.");
      const resolved: string[] = [];
      for (const id of new Set(next.tagIds)) {
        const pending = pendingTags.find((t) => t.id === id);
        if (pending) {
          const tag = makeTag(pending.name, pending.id);
          const existing = await db.tags
            .where("normalizedName")
            .equals(tag.normalizedName)
            .first();
          if (!existing) await db.tags.add(tag);
          resolved.push(existing?.id || tag.id);
        } else {
          if (!(await db.tags.get(id)))
            throw new Error(
              "Una etiqueta ya no existe. Quítala de la selección antes de guardar.",
            );
          resolved.push(id);
        }
      }
      next.tagIds = [...new Set(resolved)];
      const all = await db.movements.toArray();
      for (const relation of await db.relations
        .where("movementIds")
        .equals(next.id)
        .toArray())
        validateRelation(
          relation.type,
          all
            .filter((m) => relation.movementIds.includes(m.id))
            .map((m) => (m.id === next.id ? next : m)),
        );
      if (
        next.accountId !== current.accountId ||
        next.currency !== current.currency
      ) {
        const detached = detachMovementOrder(all, new Set([next.id]));
        const replacements = new Map(detached.map((m) => [m.id, m]));
        const saved = all
          .filter((m) => m.id !== next.id)
          .map((m) => replacements.get(m.id) || m);
        const ordered = reconcileMovementOrder(
          saved,
          [{ ...next, order: undefined }],
          [],
        );
        await db.movements.bulkPut([
          ...detached.filter((m) => m.id !== next.id),
          ...ordered.updates,
          ...ordered.pending,
        ]);
      } else {
        if (
          next.order &&
          (next.amount !== current.amount || next.balance !== current.balance)
        )
          next.order = { ...next.order, sourceIssue: true, uncertain: true };
        await db.movements.put(next);
      }
    },
  );
}

/** Discard stale automatic references before committing an in-flight import/AI result. */
export function validAutomaticCategory(
  movement: Movement,
  categories: Set<string>,
): Movement {
  return {
    ...movement,
    ...(movement.categoryId && !categories.has(movement.categoryId)
      ? { categoryId: undefined, categorySource: "none" as const }
      : {}),
    aiSuggestion:
      movement.aiSuggestion && categories.has(movement.aiSuggestion.categoryId)
        ? movement.aiSuggestion
        : undefined,
  };
}
