import type { Movement } from "../data/types";
import { normalize } from "./finance";

export const orderWarning =
  "No se ha podido confirmar la secuencia de algunos extractos o su enlace con otras importaciones. Los saldos calculados se identifican por separado.";

export const orderGroup = (m: Movement) =>
  JSON.stringify([m.accountId, m.currency]);

function groups(movements: Movement[]) {
  const result = new Map<string, Movement[]>();
  for (const m of movements) {
    const key = orderGroup(m);
    const group = result.get(key) || [];
    group.push(m);
    result.set(key, group);
  }
  return result;
}

/** The final fallback is stable, but never evidence of the time of an operation. */
export function compareMovements(a: Movement, b: Movement): number {
  return (
    a.accountId.localeCompare(b.accountId) ||
    a.currency.localeCompare(b.currency) ||
    (a.order?.rank ?? Number.MAX_SAFE_INTEGER) -
      (b.order?.rank ?? Number.MAX_SAFE_INTEGER) ||
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function orderMovements(movements: Movement[], descending = false) {
  // Merge independent account sequences by their next visible date. A global
  // date sort would break the statement order; a pairwise mixed comparator
  // (rank within account/date between accounts) would not be transitive.
  const queues = [...groups(movements).values()].map((rows) => ({
    rows: rows.sort((a, b) =>
      descending ? compareMovements(b, a) : compareMovements(a, b),
    ),
    index: 0,
  }));
  const result: Movement[] = [];
  while (queues.length) {
    queues.sort((a, b) => {
      const left = a.rows[a.index],
        right = b.rows[b.index];
      return (
        (descending
          ? right.date.localeCompare(left.date)
          : left.date.localeCompare(right.date)) ||
        left.accountId.localeCompare(right.accountId) ||
        left.currency.localeCompare(right.currency)
      );
    });
    const next = queues[0];
    result.push(next.rows[next.index++]);
    if (next.index === next.rows.length) queues.shift();
  }
  return result;
}

export function uncertainOrderGroups(movements: Movement[]) {
  return new Set(
    [...groups(movements)]
      .filter(
        ([, group]) =>
          group.length > 1 && group.some((m) => !m.order || m.order.uncertain),
      )
      .map(([key]) => key),
  );
}

type Edges = Map<string, Set<string>>;
const emptyEdges = (rows: Movement[]): Edges =>
  new Map(rows.map((m) => [m.id, new Set<string>()]));
function addChain(edges: Edges, rows: Movement[]) {
  for (let i = 1; i < rows.length; i++)
    edges.get(rows[i].id)!.add(rows[i - 1].id);
}

/** Kahn ordering with deterministic tie breaks; ties are not persisted as edges. */
function resolve(rows: Movement[], edges: Edges) {
  const priority = new Map(rows.map((m, i) => [m.id, i]));
  const byId = new Map(rows.map((m) => [m.id, m]));
  const degree = new Map(rows.map((m) => [m.id, edges.get(m.id)!.size]));
  const children = new Map(rows.map((m) => [m.id, [] as string[]]));
  for (const [id, after] of edges)
    for (const parent of after) children.get(parent)!.push(id);
  const ready = rows.filter((m) => !degree.get(m.id)).map((m) => m.id);
  const sorted: Movement[] = [];
  let uncertain = false;
  while (ready.length) {
    if (ready.length > 1) uncertain = true;
    ready.sort((a, b) => priority.get(a)! - priority.get(b)!);
    const id = ready.shift()!;
    sorted.push(byId.get(id)!);
    for (const child of children.get(id)!) {
      degree.set(child, degree.get(child)! - 1);
      if (!degree.get(child)) ready.push(child);
    }
  }
  return { sorted, uncertain, cycle: sorted.length !== rows.length };
}

function ranked(rows: Movement[], edges: Edges, forceUncertain = false) {
  const result = resolve(rows, edges);
  if (result.cycle) throw new Error("Relaciones de orden contradictorias.");
  const uncertain =
    result.uncertain ||
    forceUncertain ||
    rows.some((row) => row.order?.sourceIssue);
  return result.sorted.map((m, rank) => ({
    ...m,
    order: {
      rank,
      after: [...edges.get(m.id)!],
      uncertain,
      ...(m.order?.sourceIssue ? { sourceIssue: true } : {}),
    },
  }));
}

/** A column establishes direction only if its non-empty values are monotonic. */
function dateDirections(columns: string[][]) {
  const directions = new Set<number>();
  let varied = false;
  for (const column of columns) {
    const present = column.filter(Boolean);
    const values = present.every((value) => value.includes("T"))
      ? present
      : present.map((value) => value.slice(0, 10));
    const changes = values
      .slice(1)
      .map((value, i) => Math.sign(value.localeCompare(values[i])))
      .filter(Boolean);
    if (changes.length) varied = true;
    if (changes.length && changes.every((sign) => sign === changes[0]))
      directions.add(changes[0]);
  }
  return { directions, varied };
}

/** Preserve the document sequence across dates; evidence selects only whole-file reversal. */
export function inferSourceOrder(
  movements: Movement[],
  edited = new Set<string>(),
  originalDates?: Map<string, string[]>,
): Movement[] {
  const result = new Map<string, Movement>();
  for (const members of groups(movements).values()) {
    const rows = [...members].sort(
      (a, b) =>
        (a.sourcePosition?.position ?? 0) - (b.sourcePosition?.position ?? 0),
    );
    let checked = 0,
      forward = true,
      reverse = true;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1],
        b = rows[i];
      if (
        edited.has(a.id) ||
        edited.has(b.id) ||
        a.balance === undefined ||
        b.balance === undefined ||
        a.balanceSource === "calculated" ||
        b.balanceSource === "calculated" ||
        a.sourcePosition?.position === undefined ||
        b.sourcePosition?.previousPosition !== a.sourcePosition.position
      )
        continue;
      checked++;
      forward &&= a.balance + b.amount === b.balance;
      reverse &&= b.balance + a.amount === a.balance;
    }
    const source = rows.map(
      (m) =>
        originalDates?.get(m.id) || [
          m.date + (m.time ? "T" + m.time : ""),
          m.secondaryDate
            ? m.secondaryDate + (m.secondaryTime ? "T" + m.secondaryTime : "")
            : "",
        ],
    );
    const columns = Array.from(
      {
        length: source.reduce(
          (width, dates) => Math.max(width, dates.length),
          0,
        ),
      },
      (_, i) => source.map((d) => d[i] || ""),
    );
    const dates = dateDirections(columns);
    const hints = new Set(
      rows.flatMap((m) =>
        m.sourcePosition?.direction ? [m.sourcePosition.direction] : [],
      ),
    );
    const balanceDirection =
      checked && forward !== reverse ? (forward ? 1 : -1) : 0;
    const dateDirection =
      dates.directions.size === 1 ? [...dates.directions][0] : 0;
    const direction =
      hints.size === 1 ? [...hints][0] : balanceDirection || dateDirection || 1;
    const issue =
      rows.some((m) => m.order?.sourceIssue || edited.has(m.id)) ||
      hints.size > 1 ||
      (hints.size === 0 &&
        ((dates.directions.size > 1 && !balanceDirection) ||
          (!balanceDirection && !dateDirection && dates.varied))) ||
      (!!checked && (direction > 0 ? !forward : !reverse)) ||
      (hints.size === 0 &&
        !!balanceDirection &&
        !!dateDirection &&
        balanceDirection !== dateDirection);
    const oriented = (direction < 0 ? [...rows].reverse() : rows).map((m) => ({
      ...m,
      sourcePosition: m.sourcePosition
        ? { ...m.sourcePosition, direction: direction as 1 | -1 }
        : undefined,
      order: {
        ...(m.order || { rank: 0, after: [], uncertain: false }),
        sourceIssue: issue || undefined,
      },
    }));
    const edges = emptyEdges(oriented);
    addChain(edges, oriented);
    for (const m of ranked(oriented, edges)) result.set(m.id, m);
  }
  return movements.map((m) => result.get(m.id)!);
}

function uniqueAnchor(m: Movement, saved: Movement[]) {
  const sameAccount = saved.filter(
    (s) => s.accountId === m.accountId && s.currency === m.currency,
  );
  if (m.balance === undefined || m.balanceSource === "calculated") return;
  const matches = sameAccount.filter(
    (s) =>
      s.date === m.date &&
      s.amount === m.amount &&
      normalize(s.description) === normalize(m.description) &&
      s.balance === m.balance &&
      !s.balanceSource,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Accepted import correspondences share vertices; legacy callers may use exact bank anchors. */
export function reconcileMovementOrder(
  saved: Movement[],
  pending: Movement[],
  source: Movement[],
  accepted?: Map<string, string>,
) {
  const newIds = new Set(pending.map((m) => m.id));
  const sourceById = new Map(source.map((m) => [m.id, m]));
  const mapping = new Map<string, string>();
  for (const m of source) {
    const id = newIds.has(m.id)
      ? m.id
      : accepted
        ? accepted.get(m.id)
        : uniqueAnchor(m, saved)?.id;
    if (id) mapping.set(m.id, id);
  }
  const anchorCounts = new Map<string, number>();
  for (const id of mapping.values())
    if (!newIds.has(id)) anchorCounts.set(id, (anchorCounts.get(id) || 0) + 1);
  for (const [id, anchor] of mapping)
    if ((anchorCounts.get(anchor) || 0) > 1) mapping.delete(id);
  const affected = new Set(
    [
      ...pending,
      ...saved.filter((m) => [...mapping.values()].includes(m.id)),
    ].map(orderGroup),
  );
  const all = [...saved.filter((m) => affected.has(orderGroup(m))), ...pending];
  const updates: Movement[] = [];
  let conflict = false;
  for (const rows of groups(all).values()) {
    const ids = new Set(rows.map((m) => m.id));
    const old = orderMovements(rows.filter((m) => !newIds.has(m.id)));
    const fresh = orderMovements(rows.filter((m) => newIds.has(m.id)));
    const preferred = [...old, ...fresh];
    const existing = emptyEdges(rows);
    for (const m of old)
      for (const id of m.order?.after || [])
        if (ids.has(id)) existing.get(m.id)!.add(id);
    const edges = new Map(
      [...existing].map(([id, after]) => [id, new Set(after)]),
    );
    // Contract discarded rows without asserting balance continuity across the gap.
    const ancestors = (id: string, onlyNew: boolean): Set<string> => {
      const found = new Set<string>(),
        visited = new Set<string>(),
        stack = [...(sourceById.get(id)?.order?.after || [])];
      while (stack.length) {
        const previous = stack.pop()!;
        if (visited.has(previous)) continue;
        visited.add(previous);
        const mapped = mapping.get(previous);
        if (mapped && ids.has(mapped) && (!onlyNew || newIds.has(mapped)))
          found.add(mapped);
        else stack.push(...(sourceById.get(previous)?.order?.after || []));
      }
      return found;
    };
    for (const m of source) {
      const id = mapping.get(m.id);
      if (!id || !ids.has(id)) continue;
      for (const previous of ancestors(m.id, false))
        if (previous !== id) edges.get(id)!.add(previous);
    }
    const cycle = resolve(preferred, edges).cycle;
    if (cycle) {
      conflict = true;
      for (const m of source) {
        const id = mapping.get(m.id);
        if (!id || !newIds.has(id) || !ids.has(id)) continue;
        for (const previous of ancestors(m.id, true))
          if (previous !== id) existing.get(id)!.add(previous);
      }
    }
    updates.push(...ranked(preferred, cycle ? existing : edges, cycle));
  }
  const resolved = new Map(updates.map((m) => [m.id, m]));
  return {
    pending: pending.map((m) => resolved.get(m.id)!),
    updates: updates.filter(
      (m) =>
        !newIds.has(m.id) &&
        JSON.stringify(m.order) !==
          JSON.stringify(saved.find((s) => s.id === m.id)?.order),
    ),
    uncertain: uncertainOrderGroups(updates).size > 0,
    conflict,
  };
}

/** Invalidate edited evidence; deletion can retain precedence through the removed row. */
export function detachMovementOrder(
  all: Movement[],
  ids: Set<string>,
  deleted = false,
) {
  const byId = new Map(all.map((m) => [m.id, m]));
  const affected = new Set(all.filter((m) => ids.has(m.id)).map(orderGroup));
  const rows = all.filter(
    (m) => affected.has(orderGroup(m)) && (!deleted || !ids.has(m.id)),
  );
  const result: Movement[] = [];
  for (const group of groups(rows).values()) {
    const edges = emptyEdges(group),
      kept = new Set(group.map((m) => m.id));
    for (const m of group) {
      if (ids.has(m.id)) continue;
      const stack = [...(m.order?.after || [])],
        visited = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        if (ids.has(id)) {
          if (deleted) stack.push(...(byId.get(id)?.order?.after || []));
        } else if (kept.has(id)) edges.get(m.id)!.add(id);
      }
    }
    result.push(...ranked(orderMovements(group), edges));
  }
  return result;
}

export function validateMovementOrder(movements: Movement[]) {
  const byId = new Map(movements.map((m) => [m.id, m]));
  const integer = (n: unknown, minimum: number) =>
    Number.isSafeInteger(n) && Number(n) >= minimum;
  for (const m of movements) {
    const p = m.sourcePosition,
      o = m.order;
    if (
      p !== undefined &&
      (!p ||
        typeof p !== "object" ||
        Object.keys(p).some(
          (k) =>
            ![
              "sheet",
              "page",
              "row",
              "position",
              "previousPosition",
              "direction",
            ].includes(k),
        ) ||
        (p.direction !== undefined &&
          p.direction !== 1 &&
          p.direction !== -1) ||
        typeof p.sheet !== "string" ||
        !integer(p.row, 1) ||
        !integer(p.position, 1) ||
        (p.page !== undefined && !integer(p.page, 1)) ||
        (p.previousPosition !== undefined &&
          (!integer(p.previousPosition, 1) ||
            p.previousPosition >= p.position)))
    )
      throw new Error("Procedencia de movimiento inválida.");
    if (o === undefined) continue;
    if (
      !o ||
      typeof o !== "object" ||
      Object.keys(o).some(
        (k) => !["rank", "after", "uncertain", "sourceIssue"].includes(k),
      ) ||
      (o.sourceIssue !== undefined && typeof o.sourceIssue !== "boolean") ||
      (o.sourceIssue === true && !o.uncertain) ||
      !integer(o.rank, 0) ||
      typeof o.uncertain !== "boolean" ||
      !Array.isArray(o.after) ||
      new Set(o.after).size !== o.after.length ||
      o.after.some((id) => {
        const previous = byId.get(id);
        return (
          typeof id !== "string" ||
          !previous ||
          previous.id === m.id ||
          orderGroup(previous) !== orderGroup(m) ||
          !previous.order ||
          !(previous.order.rank < o.rank)
        );
      })
    )
      throw new Error("Orden de movimiento inválido o contradictorio.");
  }
  for (const rows of groups(movements).values()) {
    const ranks = rows.flatMap((m) => (m.order ? [m.order.rank] : []));
    if (new Set(ranks).size !== ranks.length)
      throw new Error("Posiciones de orden repetidas.");
  }
}
