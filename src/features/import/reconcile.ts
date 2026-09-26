import type { Movement } from "../../data/types";
import {
  fingerprint,
  normalize,
  validateMovementDates,
  validateOriginalAmount,
  validateMovementCosts,
} from "../../lib/finance";
import { sanitizeMovementText } from "../../lib/movement-text";
import type { Candidate } from "./types";

export const importFields = [
  "description",
  "reference",
  "merchant",
  "notes",
  "date",
  "secondaryDate",
  "time",
  "secondaryTime",
  "amount",
  "balance",
  "balanceSource",
  "originalAmount",
  "originalCurrency",
  "fee",
  "exchangeRate",
] as const;
type Field = (typeof importFields)[number];
export interface Match {
  candidates: string[];
  targetId?: string;
  reason?: "balance" | "sequence";
}
export interface Change {
  key: string;
  label: string;
  fields: readonly Field[];
  before: string;
  after: string;
  conflict: boolean;
  choice?: "saved" | "incoming";
}
export interface ReconciledCandidate extends Candidate {
  match: Match;
  target?: Movement;
  proposed?: Movement;
  changes: Change[];
  status: "new" | "known" | "update" | "review" | "omit";
  blocking: boolean;
}
const present = (v: unknown) => v !== undefined && v !== null && v !== "";
const dates = (m: Movement) => [
  ...new Set([m.date, m.secondaryDate].filter((v): v is string => !!v)),
];
const bankBalance = (m: Movement) =>
  m.balance !== undefined && m.balanceSource !== "calculated";
const sameBase = (a: Movement, b: Movement) =>
  a.accountId === b.accountId &&
  a.currency === b.currency &&
  a.amount === b.amount &&
  dates(a).some((d) => dates(b).includes(d));
const compatible = (a: Movement, b: Movement) =>
  sameBase(a, b) &&
  !(bankBalance(a) && bankBalance(b) && a.balance !== b.balance);
const sameConcept = (a: Movement, b: Movement) =>
  a.description !== "Sin concepto" &&
  normalize(a.description) === normalize(b.description);

/** Physical chains, not adjacency in a filtered list or an uncertain presentation. */
function chains(rows: Movement[], incoming: boolean): Movement[][] {
  const documents = new Map<
    string,
    { movement: Movement; position: NonNullable<Movement["sourcePosition"]> }[]
  >();
  for (const movement of rows) {
    const occurrences = incoming
      ? movement.sourcePosition
        ? [{ documentId: "incoming", position: movement.sourcePosition }]
        : []
      : movement.occurrences ||
        (movement.sourcePosition && movement.importId
          ? [
              {
                documentId: movement.importId,
                position: movement.sourcePosition,
              },
            ]
          : []);
    for (const occurrence of occurrences) {
      const key = `${movement.accountId}|${movement.currency}|${occurrence.documentId}`;
      documents.set(key, [
        ...(documents.get(key) || []),
        { movement, position: occurrence.position },
      ]);
    }
  }
  const result: Movement[][] = [];
  for (const entries of documents.values()) {
    entries.sort((a, b) => a.position.position - b.position.position);
    let chain: typeof entries = [];
    const flush = () => {
      if (chain.length)
        result.push(
          (chain[0].position.direction === -1
            ? [...chain].reverse()
            : chain
          ).map((e) => e.movement),
        );
      chain = [];
    };
    for (const entry of entries) {
      const previous = chain.at(-1);
      if (
        previous &&
        (entry.position.previousPosition !== previous.position.position ||
          entry.position.direction !== previous.position.direction)
      )
        flush();
      chain.push(entry);
    }
    flush();
  }
  return result;
}

export function matchImport(
  incoming: Movement[],
  saved: Movement[],
): Map<string, Match> {
  const result = new Map(
    incoming.map((m) => [
      m.id,
      {
        candidates: saved.filter((s) => sameBase(m, s)).map((s) => s.id),
      } as Match,
    ]),
  );
  const bank = new Map(
    incoming.map((m) => [
      m.id,
      saved.filter(
        (s) =>
          compatible(m, s) &&
          bankBalance(m) &&
          bankBalance(s) &&
          m.balance === s.balance,
      ),
    ]),
  );
  for (const m of incoming) {
    const list = bank.get(m.id)!;
    if (
      list.length === 1 &&
      [...bank.values()].filter((other) =>
        other.some((s) => s.id === list[0].id),
      ).length === 1
    )
      Object.assign(result.get(m.id)!, {
        targetId: list[0].id,
        reason: "balance",
      });
  }
  const blocks: [Movement, Movement][][] = [];
  for (const fresh of chains(incoming, true))
    for (const old of chains(saved, false)) {
      for (let i = 0; i < fresh.length; i++)
        for (let j = 0; j < old.length; j++) {
          if (
            !compatible(fresh[i], old[j]) ||
            (i > 0 && j > 0 && compatible(fresh[i - 1], old[j - 1]))
          )
            continue;
          const block: [Movement, Movement][] = [];
          for (
            let k = 0;
            i + k < fresh.length &&
            j + k < old.length &&
            compatible(fresh[i + k], old[j + k]);
            k++
          )
            block.push([fresh[i + k], old[j + k]]);
          if (
            block.length >= 3 &&
            new Set(block.map(([m]) => `${m.date}|${m.amount}`)).size >= 2 &&
            block.every(
              ([m, s]) =>
                !m.order?.sourceIssue &&
                !s.order?.sourceIssue &&
                (!result.get(m.id)!.targetId ||
                  result.get(m.id)!.targetId === s.id),
            )
          )
            blocks.push(block);
        }
    }
  // Identical evidence from a reimported document is one alignment, not ambiguity.
  const unique = [
    ...new Map(
      blocks.map((b) => [JSON.stringify(b.map(([m, s]) => [m.id, s.id])), b]),
    ).values(),
  ];
  const accepted = unique.filter(
    (block) =>
      !unique.some((other) => {
        if (other === block) return false;
        const competes = block.some(([m, s]) =>
          other.some(
            ([n, t]) =>
              (m.id === n.id && s.id !== t.id) ||
              (s.id === t.id && m.id !== n.id),
          ),
        );
        if (!competes) return false;
        // Exact nonempty concepts may eliminate a textually incompatible alternative.
        return !(
          block.every(([m, s]) => sameConcept(m, s)) &&
          !other.every(([m, s]) => sameConcept(m, s))
        );
      }),
  );
  for (const block of accepted)
    for (const [m, s] of block) {
      const match = result.get(m.id)!;
      if (!match.targetId)
        Object.assign(match, { targetId: s.id, reason: "sequence" });
    }
  // A sequence and an isolated balance anchor must not consume the same saved row twice.
  for (const match of result.values())
    if (
      match.targetId &&
      [...result.values()].filter((other) => other.targetId === match.targetId)
        .length > 1
    ) {
      const target = match.targetId;
      for (const other of result.values())
        if (other.targetId === target) {
          delete other.targetId;
          delete other.reason;
        }
    }
  return result;
}

const fieldGroups: { key: string; label: string; fields: readonly Field[] }[] =
  [
    {
      key: "dates",
      label: "Fechas y horas",
      fields: ["date", "secondaryDate", "time", "secondaryTime"],
    },
    {
      key: "original",
      label: "Importe y moneda originales",
      fields: ["originalAmount", "originalCurrency"],
    },
    { key: "balance", label: "Saldo", fields: ["balance", "balanceSource"] },
    ...(
      [
        ["description", "Concepto"],
        ["reference", "Referencia"],
        ["merchant", "Contraparte"],
        ["notes", "Notas"],
        ["fee", "Comisión"],
        ["exchangeRate", "Tipo de cambio aplicado"],
      ] as const
    ).map(([key, label]) => ({ key, label, fields: [key] })),
  ];
function dateProposal(
  old: Movement,
  fresh: Movement,
): { value: Movement; conflict: boolean } {
  const a = dates(old),
    b = dates(fresh);
  if (!(a.every((d) => b.includes(d)) || b.every((d) => a.includes(d))))
    return { value: fresh, conflict: true };
  const union = [...new Set([...a, ...b])].sort();
  const date = union[0],
    secondaryDate =
      union.length > 1
        ? union.at(-1)
        : old.secondaryDate || fresh.secondaryDate;
  const times = (m: Movement, d: string) =>
    [
      m.date === d ? m.time : undefined,
      m.secondaryDate === d ? m.secondaryTime : undefined,
    ].filter((t): t is string => !!t);
  const endpoint = (d: string, last: boolean) => {
    const x = times(old, d).sort(),
      y = times(fresh, d).sort();
    const conflict =
      x.length > 0 &&
      y.length > 0 &&
      !(x.every((t) => y.includes(t)) || y.every((t) => x.includes(t)));
    const combined = [...new Set([...x, ...y])].sort();
    return { time: last ? combined.at(-1) : combined[0], conflict };
  };
  const first = endpoint(date, false),
    last = endpoint(secondaryDate || date, true);
  return {
    value: {
      ...old,
      date,
      secondaryDate,
      time: first.time,
      secondaryTime: secondaryDate ? last.time : undefined,
    },
    conflict: first.conflict || last.conflict,
  };
}
function render(m: Movement, fields: readonly Field[]): string {
  return fields
    .map((f) => {
      const v = m[f];
      if (!present(v)) return "—";
      if (typeof v === "number")
        return new Intl.NumberFormat("es-ES", {
          style: "currency",
          currency:
            f === "originalAmount"
              ? m.originalCurrency || m.currency
              : m.currency,
        }).format(
          v /
            10 **
              (new Intl.NumberFormat("es", {
                style: "currency",
                currency:
                  f === "originalAmount"
                    ? m.originalCurrency || m.currency
                    : m.currency,
              }).resolvedOptions().maximumFractionDigits || 0),
        );
      return v === "calculated" ? "Calculado" : String(v);
    })
    .join(" · ");
}

export function enrichMovement(
  old: Movement,
  fresh: Movement,
  resolutions: Candidate["resolutions"] = {},
) {
  const proposed = { ...old };
  const changes: Change[] = [];
  for (const group of fieldGroups) {
    let value = fresh,
      conflict = false;
    if (group.key === "dates") ({ value, conflict } = dateProposal(old, fresh));
    else if (group.key === "balance") {
      if (!bankBalance(fresh) && present(old.balance)) continue;
      if (!present(fresh.balance)) continue;
      conflict = bankBalance(old) && old.balance !== fresh.balance;
    } else if (group.key === "notes") {
      if (!fresh.notes) continue;
      const lines = old.notes.split(/\r?\n/).filter(Boolean),
        seen = new Set(lines.map(normalize));
      for (const line of fresh.notes.split(/\r?\n/).filter(Boolean))
        if (!seen.has(normalize(line))) {
          lines.push(line);
          seen.add(normalize(line));
        }
      value = { ...fresh, notes: lines.join("\n") };
    } else {
      if (!group.fields.some((f) => present(fresh[f]))) continue;
      conflict = group.fields.some(
        (f) => present(old[f]) && old[f] !== fresh[f],
      );
    }
    if (group.fields.every((f) => old[f] === value[f])) continue;
    if (group.fields.some((f) => old.manualFields?.includes(f)))
      conflict = true;
    const choice = resolutions[group.key];
    changes.push({
      ...group,
      before: render(old, group.fields),
      after: render(value, group.fields),
      conflict,
      choice,
    });
    if (!conflict || choice === "incoming")
      for (const field of group.fields)
        Object.assign(proposed, { [field]: value[field] });
    if (conflict && choice)
      proposed.manualFields = [
        ...new Set([...(proposed.manualFields || []), ...group.fields]),
      ];
  }
  Object.assign(proposed, sanitizeMovementText(proposed));
  proposed.fingerprint = fingerprint(proposed);
  validateMovementDates(proposed);
  validateOriginalAmount(proposed);
  validateMovementCosts(proposed);
  return { proposed, changes };
}

export function reconcileImport(
  rows: Candidate[],
  saved: Movement[],
): ReconciledCandidate[] {
  const matches = matchImport(
    rows.map((c) => c.movement),
    saved,
  );
  const targets = rows.map((c) =>
    !c.selected || c.decision === "omit"
      ? undefined
      : typeof c.decision === "object"
        ? c.decision.targetId
        : c.decision
          ? undefined
          : matches.get(c.movement.id)?.targetId,
  );
  return rows.map((c, i) => {
    const match = matches.get(c.movement.id)!;
    const target = saved.find((s) => s.id === targets[i]);
    const omitted = c.decision === "omit" || !c.selected;
    const ambiguous = !c.decision && !target && match.candidates.length > 0;
    const invalidTarget =
      !!targets[i] &&
      (!target ||
        !match.candidates.includes(target.id) ||
        targets.filter((id) => id === target.id).length > 1);
    const proposal = target
      ? enrichMovement(target, c.movement, c.resolutions)
      : { proposed: undefined, changes: [] };
    const conflict = proposal.changes.some(
      (change) => change.conflict && !change.choice,
    );
    const changed =
      !!target &&
      importFields.some((f) => target[f] !== proposal.proposed?.[f]);
    const status = omitted
      ? "omit"
      : ambiguous || invalidTarget || conflict
        ? "review"
        : target
          ? changed
            ? "update"
            : "known"
          : "new";
    return {
      ...c,
      match,
      target,
      ...proposal,
      status,
      blocking: !omitted && (ambiguous || invalidTarget || conflict),
      duplicate: match.candidates.length ? "possible" : "none",
    };
  });
}

export function recordOccurrence(
  m: Movement,
  source: Movement,
  documentId: string,
): Movement {
  if (!source.sourcePosition) return m;
  const occurrences = [...(m.occurrences || [])];
  if (
    !occurrences.some(
      (o) =>
        o.documentId === documentId &&
        o.position.position === source.sourcePosition!.position,
    )
  )
    occurrences.push({ documentId, position: { ...source.sourcePosition } });
  return { ...m, occurrences };
}

export function validateImportMetadata(m: Movement) {
  if (m.reference !== undefined && typeof m.reference !== "string")
    throw new Error("Referencia no válida.");
  if (
    m.manualFields !== undefined &&
    (!Array.isArray(m.manualFields) ||
      new Set(m.manualFields).size !== m.manualFields.length ||
      m.manualFields.some((f) => !importFields.includes(f as Field)))
  )
    throw new Error("Campos manuales no válidos.");
  if (m.occurrences !== undefined) {
    if (!Array.isArray(m.occurrences))
      throw new Error("Procedencia no válida.");
    const seen = new Set<string>();
    for (const o of m.occurrences) {
      const p = o?.position;
      if (
        !o ||
        Object.keys(o).some((k) => !["documentId", "position"].includes(k)) ||
        typeof o.documentId !== "string" ||
        !o.documentId ||
        !p ||
        typeof p.sheet !== "string" ||
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
        !Number.isSafeInteger(p.position) ||
        p.position < 1 ||
        !Number.isSafeInteger(p.row) ||
        p.row < 1 ||
        (p.page !== undefined &&
          (!Number.isSafeInteger(p.page) || p.page < 1)) ||
        (p.direction !== undefined &&
          p.direction !== 1 &&
          p.direction !== -1) ||
        (p.previousPosition !== undefined &&
          (!Number.isSafeInteger(p.previousPosition) ||
            p.previousPosition < 1 ||
            p.previousPosition >= p.position))
      )
        throw new Error("Procedencia no válida.");
      const key = `${o.documentId}:${p.position}`;
      if (seen.has(key)) throw new Error("Procedencia repetida.");
      seen.add(key);
    }
  }
}
