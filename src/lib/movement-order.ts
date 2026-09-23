import type { Movement } from "../data/types";
import { normalize, timeValue } from "./finance";

export const orderWarning =
  "No se ha podido confirmar el orden de algunas operaciones del mismo día. El saldo procede del extracto.";

export const orderGroup = (m: Movement) =>
  JSON.stringify([m.accountId, m.currency, m.date]);

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
    a.date.localeCompare(b.date) ||
    a.accountId.localeCompare(b.accountId) ||
    a.currency.localeCompare(b.currency) ||
    (a.order?.rank ?? Number.MAX_SAFE_INTEGER) -
      (b.order?.rank ?? Number.MAX_SAFE_INTEGER) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

export function orderMovements(movements: Movement[], descending = false) {
  return [...movements].sort((a, b) =>
    descending ? compareMovements(b, a) : compareMovements(a, b),
  );
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
  return result.sorted.map((m, rank) => ({
    ...m,
    order: {
      rank,
      after: [...edges.get(m.id)!],
      uncertain: result.uncertain || forceUncertain,
    },
  }));
}

function clock(m: Movement) {
  return timeValue(m.time);
}

function balanceEvidence(rows: Movement[]) {
  let checked = 0,
    forward = true,
    reverse = true;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1],
      b = rows[i];
    if (
      a.balance === undefined ||
      b.balance === undefined ||
      a.sourcePosition?.position === undefined ||
      b.sourcePosition?.previousPosition !== a.sourcePosition.position
    )
      continue;
    checked++;
    forward &&= a.balance + b.amount === b.balance;
    reverse &&= b.balance + a.amount === a.balance;
  }
  return { checked, forward, reverse };
}

/** Adjacent complete day blocks can distinguish a deposit followed by its full withdrawal. */
function balanceDirections(
  physical: Movement[],
  days: Map<string, Movement[]>,
) {
  const choices = new Map(
    [...days].map(([key, rows]) => {
      const { checked, forward, reverse } = balanceEvidence(rows);
      return [
        key,
        checked && forward !== reverse ? [forward ? 1 : -1] : [1, -1],
      ];
    }),
  );
  const physicalIndices = new Map(physical.map((m, i) => [m.id, i]));
  const chronological = [...days].sort(([, a], [, b]) =>
    compareMovements(a[0], b[0]),
  );
  const constraints: [string, string, [number, number][]][] = [];
  for (let i = 1; i < chronological.length; i++) {
    const [ak, a] = chronological[i - 1],
      [bk, b] = chronological[i];
    if (a[0].accountId !== b[0].accountId || a[0].currency !== b[0].currency)
      continue;
    // Interleaved dates are not adjacent complete day blocks.
    if (
      [a, b].some(
        (rows) =>
          physicalIndices.get(rows.at(-1)!.id)! -
            physicalIndices.get(rows[0].id)! +
            1 !==
          rows.length,
      )
    )
      continue;
    const indices = [...a, ...b]
      .map((m) => physicalIndices.get(m.id)!)
      .sort((x, y) => x - y);
    if (
      indices.at(-1)! - indices[0] + 1 !== indices.length ||
      indices
        .slice(1)
        .some(
          (index) =>
            physical[index].sourcePosition?.previousPosition === undefined ||
            physical[index].sourcePosition?.previousPosition !==
              physical[index - 1].sourcePosition?.position,
        )
    )
      continue;
    const permitted: [number, number][] = [];
    for (const ad of choices.get(ak)!)
      for (const bd of choices.get(bk)!) {
        const last = ad > 0 ? a.at(-1)! : a[0],
          first = bd > 0 ? b[0] : b.at(-1)!;
        if (
          last.balance === undefined ||
          first.balance === undefined ||
          last.balance + first.amount === first.balance
        )
          permitted.push([ad, bd]);
      }
    if (permitted.length) constraints.push([ak, bk, permitted]);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [ak, bk, permitted] of constraints) {
      const a = choices.get(ak)!,
        b = choices.get(bk)!;
      const pairs = permitted.filter(
        ([ad, bd]) => a.includes(ad) && b.includes(bd),
      );
      if (!pairs.length) continue; // Inconsistent evidence must not manufacture an orientation.
      const nextA = a.filter((d) => pairs.some(([ad]) => ad === d));
      const nextB = b.filter((d) => pairs.some(([, bd]) => bd === d));
      if (nextA.length !== a.length || nextB.length !== b.length)
        changed = true;
      choices.set(ak, nextA);
      choices.set(bk, nextB);
    }
  }
  return choices;
}

/** Analyze every candidate before filtering duplicates or deselected rows. */
export function inferSourceOrder(
  movements: Movement[],
  edited = new Set<string>(),
): Movement[] {
  const physical = movements
    .filter((m) => !edited.has(m.id))
    .sort(
      (a, b) =>
        (a.sourcePosition?.position ?? 0) - (b.sourcePosition?.position ?? 0),
    );
  const days = groups(physical),
    balanceChoices = balanceDirections(physical, days);
  const result = new Map<string, Movement>();
  for (const [key, rows] of days) {
    let edges = emptyEdges(rows);
    const timed = rows
      .filter((m) => Number.isFinite(clock(m)))
      .sort((a, b) => clock(a) - clock(b));
    // Compare only written times inside the same source/account/day, never zones.
    for (let i = 1; i < timed.length; i++) {
      if (clock(timed[i - 1]) < clock(timed[i]))
        for (const previous of timed.filter(
          (m) => clock(m) === clock(timed[i - 1]),
        ))
          for (const next of timed.filter((m) => clock(m) === clock(timed[i])))
            edges.get(next.id)!.add(previous.id);
    }
    const { checked, forward, reverse } = balanceEvidence(rows);
    // Day ordering alone cannot establish the orientation inside a tied day.
    let direction = 0;
    let conflict = checked > 0 && !forward && !reverse;
    if (balanceChoices.get(key)!.length === 1)
      direction = balanceChoices.get(key)![0];
    if (conflict) direction = 0;
    const preferred = direction < 0 ? [...rows].reverse() : rows;
    if (direction) {
      const combined = new Map(
        [...edges].map(([id, after]) => [id, new Set(after)]),
      );
      addChain(combined, preferred);
      if (!resolve(preferred, combined).cycle) edges = combined;
      else conflict = true;
    }
    // A clock/balance contradiction is not reliable precedence. Retain physical
    // presentation provisionally; empty edges keep that uncertainty after saving.
    if (conflict) edges = emptyEdges(rows);
    for (const m of ranked(conflict ? rows : preferred, edges))
      result.set(m.id, m);
  }
  return movements.map((m) => result.get(m.id) || { ...m, order: undefined });
}

function uniqueAnchor(m: Movement, saved: Movement[]) {
  const sameAccount = saved.filter(
    (s) => s.accountId === m.accountId && s.currency === m.currency,
  );
  if (m.balance === undefined) return;
  const matches = sameAccount.filter(
    (s) =>
      s.date === m.date &&
      s.amount === m.amount &&
      normalize(s.description) === normalize(m.description) &&
      s.balance === m.balance,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** New candidates and saved rows share vertices only through unique exact matches. */
export function reconcileMovementOrder(
  saved: Movement[],
  pending: Movement[],
  source: Movement[],
) {
  const newIds = new Set(pending.map((m) => m.id));
  const sourceById = new Map(source.map((m) => [m.id, m]));
  const mapping = new Map<string, string>();
  for (const m of source) {
    const id = newIds.has(m.id) ? m.id : uniqueAnchor(m, saved)?.id;
    if (id) mapping.set(m.id, id);
  }
  const anchorCounts = new Map<string, number>();
  for (const id of mapping.values())
    if (!newIds.has(id)) anchorCounts.set(id, (anchorCounts.get(id) || 0) + 1);
  for (const [id, anchor] of mapping)
    if ((anchorCounts.get(anchor) || 0) > 1) mapping.delete(id);
  const affected = new Set(pending.map(orderGroup));
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
            !["sheet", "page", "row", "position", "previousPosition"].includes(
              k,
            ),
        ) ||
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
      Object.keys(o).some((k) => !["rank", "after", "uncertain"].includes(k)) ||
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
