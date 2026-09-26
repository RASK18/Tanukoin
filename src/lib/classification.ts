import type { Category, Movement, Tag } from "../data/types";
import { normalize } from "./finance";

export type TagMode = "all" | "any" | "none";

/** A tree index shared by selectors, filters, reports and local AI. */
export function categoryTree(categories: Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const children = new Map<string, Category[]>();
  for (const category of categories) {
    const key = category.parentId || "";
    const siblings = children.get(key) || [];
    siblings.push(category);
    children.set(key, siblings);
  }
  for (const siblings of children.values())
    siblings.sort(
      (a, b) =>
        (a.order ?? Number.MAX_SAFE_INTEGER) -
          (b.order ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, "es") ||
        a.id.localeCompare(b.id),
    );
  function ancestors(id?: string): Category[] {
    const result: Category[] = [],
      seen = new Set<string>();
    while (id && byId.has(id) && !seen.has(id)) {
      seen.add(id);
      const category = byId.get(id)!;
      result.push(category);
      id = category.parentId;
    }
    return result.reverse();
  }
  function branch(id: string): Set<string> {
    const result = new Set<string>(),
      pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (result.has(current) || !byId.has(current)) continue;
      result.add(current);
      for (const child of children.get(current) || []) pending.push(child.id);
    }
    return result;
  }
  const path = (id?: string) =>
    ancestors(id)
      .map((c) => c.name)
      .join(" → ");
  // Groups are disjoint: roots, or immediate children and direct assignments.
  function group(id?: string, scope?: string): string {
    const chain = ancestors(id);
    if (!scope) return chain[0]?.id || "";
    const index = chain.findIndex((c) => c.id === scope);
    return index < 0 ? "" : chain[index + 1]?.id || scope;
  }
  const options: { category: Category; depth: number; path: string }[] = [];
  const pending = [...(children.get("") || [])]
    .reverse()
    .map((category) => ({ category, depth: 0 }));
  const visited = new Set<string>();
  while (pending.length) {
    const row = pending.pop()!;
    if (visited.has(row.category.id)) continue;
    visited.add(row.category.id);
    options.push({ ...row, path: path(row.category.id) });
    for (const category of [...(children.get(row.category.id) || [])].reverse())
      pending.push({ category, depth: row.depth + 1 });
  }
  return { byId, children, ancestors, branch, path, group, options };
}

export function validateCategoryTree(categories: Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const complete = new Set<string>();
  for (const category of categories) {
    const visiting = new Set<string>();
    let current: Category | undefined = category;
    while (current && !complete.has(current.id)) {
      if (visiting.has(current.id))
        throw new Error(
          "Una categoría no puede depender de sí misma ni de sus descendientes.",
        );
      visiting.add(current.id);
      if (current.parentId && !byId.has(current.parentId))
        throw new Error("La categoría padre ya no existe.");
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    for (const id of visiting) complete.add(id);
  }
}

export function matchesTags(
  movement: Pick<Movement, "tagIds">,
  selected: string[],
  mode: TagMode = "all",
) {
  const assigned = movement.tagIds || [];
  if (mode === "none") return assigned.length === 0;
  if (!selected.length) return true;
  return mode === "any"
    ? selected.some((id) => assigned.includes(id))
    : selected.every((id) => assigned.includes(id));
}

export function movementSearchText(
  movement: Movement,
  tree: ReturnType<typeof categoryTree>,
  tags: Tag[],
) {
  const names = new Map(tags.map((t) => [t.id, t.name]));
  return normalize(
    [
      movement.description,
      movement.reference || "",
      movement.merchant,
      movement.notes,
      tree.path(movement.categoryId),
      ...(movement.tagIds || []).map((id) => names.get(id) || ""),
    ].join(" "),
  );
}

export function makeTag(name: string, id: string = crypto.randomUUID()): Tag {
  name = name.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Escribe un nombre para la etiqueta.");
  return { id, name, normalizedName: normalize(name) };
}
