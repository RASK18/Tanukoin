import { Field } from "../../components/ui";
import type { Candidate, ReviewField } from "./types";
import { fieldValue, reviewIssues } from "./review";

const labels: Record<ReviewField, string> = {
  date: "Fecha principal",
  secondaryDate: "Fecha secundaria",
  time: "Hora principal",
  secondaryTime: "Hora secundaria",
  description: "Concepto",
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
  opening,
  onOpening,
  calculate,
  balanceError,
  errors,
}: {
  candidates: Candidate[];
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
                const highlighted = issues.some((issue) =>
                  issue.fields.includes(key),
                );
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
                    issues.length || errors[m.id] ? "review-row-warning" : ""
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
                      checked={c.selected}
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
                    <span>
                      {c.duplicate === "possible"
                        ? c.balanceMissing
                          ? "Revisar coincidencia: falta saldo bancario comparable"
                          : "Posible duplicado"
                        : "Nuevo"}
                    </span>
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
