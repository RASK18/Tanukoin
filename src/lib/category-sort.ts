import type { CategoryDrop } from "../data/classification";
import type { Category } from "../data/types";
export type CategoryRow = { category: Category; depth: number; path: string };

/** A gap in preorder can only have a depth between its two neighbours. */
export function projectCategoryGap(
  rows: CategoryRow[],
  index: number,
  requestedDepth: number,
) {
  index = Math.max(0, Math.min(rows.length, index));
  const previous = rows[index - 1],
    next = rows[index];
  const depth = Math.max(
    next?.depth ?? 0,
    Math.min(requestedDepth, previous ? previous.depth + 1 : 0),
  );
  let parentId: string | undefined;
  if (depth > 0) {
    for (let i = index - 1; i >= 0; i--) {
      if (rows[i].depth === depth - 1) {
        parentId = rows[i].category.id;
        break;
      }
    }
  }
  const drop: CategoryDrop =
    next?.depth === depth
      ? { targetId: next.category.id, position: "before" }
      : { targetId: parentId, position: "inside" };
  return { index, depth, parentId, drop };
}
