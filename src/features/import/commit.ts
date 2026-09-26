import { db } from "../../data/db";
import type { Movement } from "../../data/types";
import { validAutomaticCategory } from "../../data/classification";
import { reconcileMovementOrder } from "../../lib/movement-order";
import { recordOccurrence, type ReconciledCandidate } from "./reconcile";

export class ImportChangedError extends Error {
  constructor() {
    super(
      "Los movimientos guardados han cambiado. Revisa las propuestas actualizadas antes de guardar.",
    );
  }
}

export async function commitImport(
  rows: ReconciledCandidate[],
  snapshot: Movement[],
  prepared: Movement[],
  source: Movement[],
  documentId: string,
  progress?: (done: number, total: number) => void,
) {
  if (rows.some((c) => c.blocking))
    throw new Error("Resuelve las coincidencias pendientes.");
  return db.transaction(
    "rw",
    [db.movements, db.categories, db.accounts, db.embeddings],
    async () => {
      const saved = await db.movements.toArray();
      const groups = new Set(
        rows.map((c) => `${c.movement.accountId}|${c.movement.currency}`),
      );
      const relevant = (list: Movement[]) =>
        list
          .filter((m) => groups.has(`${m.accountId}|${m.currency}`))
          .sort((a, b) => a.id.localeCompare(b.id));
      if (
        JSON.stringify(relevant(saved)) !== JSON.stringify(relevant(snapshot))
      )
        throw new ImportChangedError();
      const accounts = new Map(
        (await db.accounts.toArray()).map((a) => [a.id, a]),
      );
      if (
        rows.some(
          (c) =>
            accounts.get(c.movement.accountId)?.currency !==
            c.movement.currency,
        )
      )
        throw new Error(
          "La cuenta de destino ha cambiado. Vuelve a seleccionarla.",
        );
      const categories = new Set(
        (await db.categories.toArray()).map((c) => c.id),
      );
      const sourceById = new Map(source.map((m) => [m.id, m]));
      const pending = prepared.map((m) =>
        recordOccurrence(
          validAutomaticCategory(m, categories),
          sourceById.get(m.id) || m,
          documentId,
        ),
      );
      const updates = new Map<string, Movement>();
      const accepted = new Map<string, string>();
      for (const row of rows) {
        if (row.status === "omit" || !row.target || !row.proposed) continue;
        if ([...accepted.values()].includes(row.target.id))
          throw new Error(
            "Dos filas corresponden al mismo movimiento guardado.",
          );
        accepted.set(row.movement.id, row.target.id);
        updates.set(
          row.target.id,
          recordOccurrence(
            row.proposed,
            sourceById.get(row.movement.id) || row.movement,
            documentId,
          ),
        );
      }
      const combined = saved.map((m) => updates.get(m.id) || m);
      const ordered = reconcileMovementOrder(
        combined,
        pending,
        source,
        accepted,
      );
      for (const update of ordered.updates) updates.set(update.id, update);
      for (const update of updates.values()) {
        const old = saved.find((m) => m.id === update.id)!;
        if (
          old.description !== update.description ||
          old.reference !== update.reference ||
          old.merchant !== update.merchant
        )
          await db.embeddings.delete(update.id);
      }
      if (updates.size)
        await db.movements.bulkPut(
          [...updates.values()].filter(
            (m) =>
              JSON.stringify(m) !==
              JSON.stringify(saved.find((s) => s.id === m.id)),
          ),
        );
      for (let i = 0; i < ordered.pending.length; i += 250) {
        await db.movements.bulkAdd(ordered.pending.slice(i, i + 250));
        progress?.(
          Math.min(i + 250, ordered.pending.length),
          ordered.pending.length,
        );
      }
      return ordered.uncertain;
    },
  );
}
