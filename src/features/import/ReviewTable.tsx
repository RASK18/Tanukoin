import type { ReconciledCandidate } from "./reconcile";
import type { Movement } from "../../data/types";
import { movementDescription } from "../../lib/movement-text";
import { Field } from "../../components/ui";
import type { Candidate, ReviewField } from "./types";
import { fieldValue, reviewIssues } from "./review";

const labels: Record<ReviewField, string> = {
  date: "Fecha principal",
  secondaryDate: "Fecha secundaria",
  time: "Hora principal",
  secondaryTime: "Hora secundaria",
  description: "Concepto",
  reference: "Referencia",
  merchant: "Contraparte",
  notes: "Notas",
  amount: "Importe",
  balance: "Saldo",
  originalAmount: "Importe original",
  originalCurrency: "Moneda original",
  fee: "Comisión",
  exchangeRate: "Tipo de cambio aplicado",
};
export function ReviewTable({
  candidates,
  onEdit,
  onSelect,
  onDecision,
  onResolve,
  saved,
  opening,
  onOpening,
  calculate,
  balanceError,
  errors,
}: {
  candidates: ReconciledCandidate[];
  saved: Movement[];
  onDecision: (id: string, decision: Candidate["decision"]) => void;
  onResolve: (id: string, key: string, value: "saved" | "incoming") => void;
  onEdit: (id: string, key: ReviewField, value: string) => void;
  onSelect: (id: string, selected: boolean) => void;
  opening: string;
  onOpening: (value: string) => void;
  calculate: boolean;
  balanceError: string;
  errors: Record<string, string>;
}) {
  return (
    <>
      <div className="review-opening-row">
        {" "}
        {calculate && (
          <div className="review-opening">
            <Field label="Saldo antes del primer movimiento">
              <input
                inputMode="decimal"
                value={opening}
                onChange={(e) => onOpening(e.target.value)}
                aria-invalid={!!balanceError}
                aria-describedby="opening-help opening-error"
              />
            </Field>
            <small id="opening-help">
              En {candidates[0]?.movement.currency}. Se suman todas las filas
              revisadas, incluidas las desmarcadas. No se reconstruyen
              operaciones ausentes.
            </small>
            <p id="opening-error" role={balanceError ? "alert" : undefined}>
              {balanceError}
            </p>
          </div>
        )}
      </div>
      <div className="table-scroll import-review">
        <table>
          <thead>
            <tr>
              <th>Incluir</th>
              <th>Fechas y horas</th>
              <th>Concepto y detalles</th>
              <th>Importes y moneda</th>
              <th>Saldo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const m = c.movement;
              const issues = reviewIssues(c);
              const issueId = `issues-${m.id}`;
              const field = (key: ReviewField) => {
                const editable =
                  [...(c.issues || []), ...issues].some((issue) =>
                    issue.fields.includes(key),
                  ) && !(key === "balance" && calculate);
                const highlighted =
                  c.changes.some(
                    (change) =>
                      change.conflict &&
                      !change.choice &&
                      change.fields.some((field) => field === key),
                  ) || issues.some((issue) => issue.fields.includes(key));
                const value = c.edits?.[key] ?? fieldValue(m, key);
                const label = `${key === "date" ? "Fecha" : labels[key]} fila ${c.row}${c.page ? ` de la página ${c.page}` : ""}`;
                return (
                  <label
                    className={`review-field${highlighted ? " review-field-warning" : ""}`}
                    key={key}
                  >
                    <span>
                      {labels[key]}
                      {["amount", "balance", "fee"].includes(key)
                        ? ` · ${m.currency}`
                        : ""}
                      {highlighted && <strong> · Revisar</strong>}
                    </span>
                    {key === "notes" || key === "description" ? (
                      <textarea
                        aria-label={label}
                        readOnly={!editable}
                        value={value}
                        placeholder="—"
                        rows={key === "notes" ? 4 : 2}
                        onChange={(e) => onEdit(m.id, key, e.target.value)}
                        aria-describedby={editable ? issueId : undefined}
                      />
                    ) : (
                      <input
                        aria-label={label}
                        readOnly={!editable}
                        type={
                          !editable && !value
                            ? "text"
                            : key === "date" || key === "secondaryDate"
                              ? "date"
                              : key === "time" || key === "secondaryTime"
                                ? "time"
                                : "text"
                        }
                        step="any"
                        value={value}
                        placeholder="—"
                        onChange={(e) => onEdit(m.id, key, e.target.value)}
                        aria-describedby={editable ? issueId : undefined}
                      />
                    )}
                  </label>
                );
              };
              return (
                <tr
                  key={m.id}
                  className={
                    issues.length || errors[m.id] || c.blocking
                      ? "review-row-warning"
                      : ""
                  }
                >
                  <td
                    className={
                      c.duplicate === "possible"
                        ? "review-selection-warning"
                        : ""
                    }
                  >
                    <input
                      aria-label={`Incluir fila ${c.row}${c.page ? ` de la página ${c.page}` : ""}`}
                      type="checkbox"
                      checked={
                        c.selected &&
                        c.status !== "known" &&
                        c.status !== "omit"
                      }
                      disabled={c.status === "known"}
                      onChange={(e) => onSelect(m.id, e.target.checked)}
                    />
                    <small>
                      {c.page ? `Pág. ${c.page}` : c.sheet} · Fila {c.row}
                    </small>
                  </td>
                  <td data-label="Fechas y horas">
                    {field("date")}
                    {field("time")}
                    {field("secondaryDate")}
                    {field("secondaryTime")}
                  </td>
                  <td data-label="Concepto y detalles">
                    {field("description")}
                    {field("reference")}
                    {field("merchant")}
                    {field("notes")}
                  </td>
                  <td data-label="Importes y moneda">
                    {field("amount")}
                    <small>Moneda: {m.currency}</small>
                    {field("originalAmount")}
                    {field("originalCurrency")}
                    {field("fee")}
                    {field("exchangeRate")}
                  </td>
                  <td data-label="Saldo">
                    {field("balance")}
                    <small>
                      {m.balanceSource === "calculated"
                        ? "Calculado"
                        : m.balance === undefined
                          ? "No disponible"
                          : "Del extracto"}
                    </small>
                  </td>
                  <td data-label="Estado">
                    <strong>
                      {
                        {
                          new: "Nuevo",
                          known: "Ya importado",
                          update: "Completar datos",
                          review: "Revisar coincidencia",
                          omit: "Omitido",
                        }[c.status]
                      }
                    </strong>
                    {c.match.reason && (
                      <small>
                        {c.match.reason === "balance"
                          ? "Coincidencia única con saldo bancario"
                          : "Coincidencia por secuencia"}
                      </small>
                    )}
                    {c.match.candidates.length > 0 && (
                      <label className="review-field">
                        <span>Correspondencia</span>
                        <select
                          aria-label={`Decisión fila ${c.row}${c.page ? ` de la página ${c.page}` : ""}`}
                          value={
                            typeof c.decision === "object"
                              ? c.decision.targetId
                              : c.decision || ""
                          }
                          onChange={(e) =>
                            onDecision(
                              m.id,
                              e.target.value === "new" ||
                                e.target.value === "omit"
                                ? e.target.value
                                : e.target.value
                                  ? { targetId: e.target.value }
                                  : undefined,
                            )
                          }
                        >
                          <option value="">
                            {c.match.targetId
                              ? "Correspondencia detectada"
                              : "Elige una decisión"}
                          </option>
                          <option value="new">Es una operación nueva</option>
                          {c.match.candidates.map((id) => {
                            const old = saved.find((s) => s.id === id)!;
                            return (
                              <option key={id} value={id}>
                                Corresponde a: {old.date} ·{" "}
                                {movementDescription(old)}
                              </option>
                            );
                          })}
                          <option value="omit">Omitir</option>
                        </select>
                      </label>
                    )}
                    {c.changes.map((change) => (
                      <div
                        key={change.key}
                        className={
                          change.conflict && !change.choice
                            ? "review-field-warning"
                            : "review-change"
                        }
                      >
                        <strong>{change.label}</strong>
                        <small>Guardado: {change.before}</small>
                        <small>Propuesta: {change.after}</small>
                        {change.conflict && (
                          <select
                            aria-label={`Resolver ${change.label} fila ${c.row}${c.page ? ` de la página ${c.page}` : ""}`}
                            value={change.choice || ""}
                            onChange={(e) => {
                              if (e.target.value)
                                onResolve(
                                  m.id,
                                  change.key,
                                  e.target.value as "saved" | "incoming",
                                );
                            }}
                          >
                            <option value="">Elige qué conservar</option>
                            <option value="saved">Conservar guardado</option>
                            <option value="incoming">Utilizar entrante</option>
                          </select>
                        )}
                      </div>
                    ))}
                    {c.blocking && (
                      <p role="status">
                        Resuelve la coincidencia y sus campos antes de guardar.
                        Cada operación guardada solo puede corresponder a una
                        fila.
                      </p>
                    )}
                    <ul id={issueId}>
                      {issues.map((issue, i) => (
                        <li key={i}>{issue.message}</li>
                      ))}
                    </ul>
                    {errors[m.id] && <p role="alert">{errors[m.id]}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
