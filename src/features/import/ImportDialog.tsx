import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import { db } from "../../data/db";
import type { ImportProfile, Movement } from "../../data/types";
import {
  applyRules,
  money,
  fingerprint,
  parseAmount,
  parseDate,
} from "../../lib/finance";
import { useApp, Modal, Field, AccountSelect } from "../../components/ui";
import { buildCandidates, defaultProfile } from "./parse";
import type { Candidate, ParsedFile } from "./types";

export function ImportDialog({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Movement[];
}) {
  const { data, run, notify } = useApp();
  const [parsed, setParsed] = useState<ParsedFile>();
  const [file, setFile] = useState<File>();
  const [delimiter, setDelimiter] = useState("");
  const [sheet, setSheet] = useState(0),
    [pages, setPages] = useState<number[]>([]);
  const [account, setAccount] = useState(data.accounts[0]?.id || "");
  const [profile, setProfile] = useState<ImportProfile>({ ...defaultProfile });
  const [candidates, setCandidates] = useState<Candidate[]>(
    initial?.map((m, i) => ({
      movement: m,
      row: i + 1,
      duplicate: data.movements.some(
        (old) =>
          old.accountId === m.accountId &&
          m.externalId &&
          old.externalId === m.externalId,
      )
        ? "exact"
        : data.movements.some((old) => old.fingerprint === m.fingerprint)
          ? "possible"
          : "none",
      selected: !data.movements.some(
        (old) =>
          old.fingerprint === m.fingerprint ||
          (m.externalId &&
            old.externalId === m.externalId &&
            old.accountId === m.accountId),
      ),
    })) || [],
  );
  const [errors, setErrors] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [review, setReview] = useState(!!initial),
    [progress, setProgress] = useState(0),
    [previewPage, setPreviewPage] = useState(0);
  const [editErrors, setEditErrors] = useState<Record<number, string>>({});
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  function read(selected: File, separator = delimiter) {
    setFile(selected);
    setLoading(true);
    setProgress(0);
    setErrors([]);
    setReview(false);
    setParsed(undefined);
    worker.current?.terminate();
    worker.current = new Worker(
      new URL("./import.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (e) => {
      if (e.data.progress) setProgress(e.data.progress);
      if (e.data.error) {
        setErrors([e.data.error]);
        setLoading(false);
      }
      if (e.data.result) {
        setParsed(e.data.result);
        setSheet(0);
        setPages([0]);
        setLoading(false);
      }
    };
    worker.current.onerror = () => {
      setErrors([
        "No se pudo iniciar el lector local. Comprueba los recursos offline o vuelve a cargar.",
      ]);
      setLoading(false);
    };
    worker.current.postMessage({ file: selected, delimiter: separator });
  }
  const rows = parsed?.sheets[sheet]?.rows || [];
  const headers = rows[profile.headerRow] || [];
  const maxColumns = Math.max(
    headers.length,
    ...rows.slice(0, 20).map((r) => r.length),
    1,
  );
  function preview() {
    const target = data.accounts.find((a) => a.id === account);
    if (!target) {
      notify("Crea o selecciona una cuenta antes de importar.");
      return;
    }
    const selected = parsed?.sheets[sheet]?.page ? pages : [sheet];
    const all: Candidate[] = [];
    const failures: string[] = [];
    for (const index of selected) {
      const s = parsed!.sheets[index];
      const result = buildCandidates(s.rows, profile, target, parsed!.name, [
        ...data.movements,
        ...all.map((c) => c.movement),
      ]);
      all.push(...result.candidates);
      failures.push(...result.errors.map((e) => `${s.name}: ${e}`));
    }
    setCandidates(all);
    setErrors(failures);
    setReview(true);
    setPreviewPage(0);
  }
  async function save() {
    setLoading(true);
    const importId = crypto.randomUUID();
    const success = await run(
      (async () => {
        let prepared = candidates
          .filter((c) => c.selected && c.duplicate !== "exact")
          .map((c) => applyRules({ ...c.movement, importId }, data.rules));
        if ((await db.models.get("embeddings"))?.ready) {
          try {
            const { categorize } = await import("../ai/client");
            prepared = await categorize(
              prepared,
              data.categories,
              data.movements,
            );
          } catch {
            notify(
              "La IA no está disponible. Se importarán los movimientos con tus reglas; puedes categorizarlos después.",
            );
          }
        }
        await db.transaction("rw", db.movements, async () => {
          for (const m of prepared) {
            if (
              m.externalId &&
              (await db.movements
                .where("[accountId+externalId]")
                .equals([m.accountId, m.externalId])
                .count())
            )
              continue;
            await db.movements.add(m);
          }
        });
      })(),
      "Movimientos importados. Todo se ha guardado en este navegador.",
    );
    setLoading(false);
    if (success) onClose();
  }
  function editCandidate(
    index: number,
    key: "date" | "amount" | "description",
    value: string,
  ) {
    try {
      const next = [...candidates];
      const movement = { ...next[index].movement };
      if (key === "amount")
        movement.amount = parseAmount(value, ",", movement.currency);
      else if (key === "date") movement.date = parseDate(value, "YMD");
      else {
        if (!value.trim()) throw new Error("Falta el concepto");
        movement.description = value;
      }
      movement.fingerprint = fingerprint(movement);
      next[index] = { ...next[index], movement };
      setCandidates(next);
      setEditErrors((errors) => {
        const copy = { ...errors };
        delete copy[index];
        return copy;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Dato inválido";
      setEditErrors((errors) => ({ ...errors, [index]: message }));
      notify(message);
    }
  }
  return (
    <Modal
      title="Importar movimientos"
      onClose={() => {
        if (!loading) onClose();
      }}
      wide
    >
      <div className="steps">
        <span className={!review ? "active" : ""}>1. Archivo y columnas</span>
        <ArrowRight size={15} />
        <span className={review ? "active" : ""}>2. Revisar e importar</span>
      </div>
      {!review && (
        <>
          <label className="dropzone">
            <Upload size={28} />
            <strong>{file?.name || "Elige tu extracto bancario"}</strong>
            <span>
              CSV, Excel o PDF con texto · Máximo 100 MB · Tu archivo no se sube
            </span>
            <input
              aria-label="Archivo bancario"
              type="file"
              accept=".csv,.tsv,.xls,.xlsx,.pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) read(e.target.files[0]);
              }}
            />
          </label>
          {!data.accounts.length && (
            <div className="notice warning">
              Primero crea una cuenta en la sección Cuentas.
            </div>
          )}
          {parsed && (
            <>
              <div className="form-grid">
                <Field label="Cuenta de destino">
                  <AccountSelect
                    value={account}
                    onChange={setAccount}
                    data={data}
                  />
                </Field>
                <Field label="Hoja / página">
                  <select
                    value={sheet}
                    onChange={(e) => setSheet(Number(e.target.value))}
                  >
                    {parsed.sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Perfil guardado">
                  <select
                    value={profile.id}
                    onChange={(e) =>
                      setProfile(
                        data.profiles.find((p) => p.id === e.target.value) || {
                          ...defaultProfile,
                        },
                      )
                    }
                  >
                    <option value="">Personalizado</option>
                    {data.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fila de cabecera">
                  <input
                    type="number"
                    min="1"
                    max={Math.max(rows.length, 1)}
                    value={profile.headerRow + 1}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        headerRow: Math.max(0, Number(e.target.value) - 1),
                      })
                    }
                  />
                </Field>
                <Field label="Formato de fecha">
                  <select
                    value={profile.dateFormat}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        dateFormat: e.target
                          .value as ImportProfile["dateFormat"],
                      })
                    }
                  >
                    <option value="DMY">Día / mes / año</option>
                    <option value="MDY">Mes / día / año</option>
                    <option value="YMD">Año / mes / día</option>
                  </select>
                </Field>
                <Field label="Separador decimal">
                  <select
                    value={profile.decimal}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        decimal: e.target.value as "," | ".",
                      })
                    }
                  >
                    <option value=",">Coma · 1.234,56</option>
                    <option value=".">Punto · 1,234.56</option>
                  </select>
                </Field>
                {file?.name.toLowerCase().match(/\.(csv|tsv)$/) && (
                  <Field label="Separador CSV">
                    <select
                      value={delimiter}
                      onChange={(e) => {
                        setDelimiter(e.target.value);
                        read(file, e.target.value);
                      }}
                    >
                      <option value="">Detectar</option>
                      <option value=";">Punto y coma</option>
                      <option value=",">Coma</option>
                      <option value={"\t"}>Tabulador</option>
                    </select>
                  </Field>
                )}
              </div>
              {parsed.sheets[sheet]?.page && (
                <fieldset>
                  <legend>Páginas que se importarán</legend>
                  <div className="chips">
                    {parsed.sheets.map((s, i) => (
                      <label key={i}>
                        <input
                          type="checkbox"
                          checked={pages.includes(i)}
                          onChange={(e) =>
                            setPages(
                              e.target.checked
                                ? [...pages, i]
                                : pages.filter((p) => p !== i),
                            )
                          }
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <h3>Relaciona las columnas</h3>
              <div className="form-grid columns-grid">
                {Object.entries({
                  date: "Fecha",
                  description: "Concepto",
                  amount: "Importe con signo",
                  debit: "Cargo (alternativa)",
                  credit: "Abono (alternativa)",
                  merchant: "Comercio",
                  externalId: "Identificador bancario",
                }).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <select
                      value={
                        profile.columns[key as keyof typeof profile.columns]
                      }
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          columns: {
                            ...profile.columns,
                            [key]: Number(e.target.value),
                          },
                        })
                      }
                    >
                      <option value={-1}>No usar</option>
                      {Array.from({ length: maxColumns }, (_, i) => (
                        <option key={i} value={i}>
                          {i + 1}. {headers[i] || `Columna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <div className="table-scroll preview-table">
                <table>
                  <thead>
                    <tr>
                      {Array.from({ length: maxColumns }, (_, i) => (
                        <th key={i}>
                          {i + 1}. {headers[i]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice(profile.headerRow + 1, profile.headerRow + 7)
                      .map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="inline-form">
                <input
                  aria-label="Nombre del perfil"
                  placeholder="Nombre para guardar este perfil"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
                <button
                  className="button secondary"
                  disabled={!profile.name.trim()}
                  onClick={() =>
                    run(
                      db.profiles.put({
                        ...profile,
                        id: profile.id || crypto.randomUUID(),
                      }),
                      "Perfil guardado",
                    )
                  }
                >
                  Guardar perfil
                </button>
              </div>
              {parsed.warnings.map((warning, i) => (
                <p className="muted" key={i}>
                  {warning}
                </p>
              ))}
              <div className="modal-actions">
                <button
                  className="button primary"
                  disabled={
                    !account ||
                    loading ||
                    profile.columns.date < 0 ||
                    profile.columns.description < 0 ||
                    (profile.columns.amount < 0 &&
                      profile.columns.debit < 0 &&
                      profile.columns.credit < 0)
                  }
                  onClick={preview}
                >
                  Revisar movimientos <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </>
      )}
      {loading && (
        <div className="notice">
          <FileSpreadsheet size={18} />
          <span>
            Procesando localmente…{" "}
            {progress > 0 ? `${Math.round(progress * 100)} %` : ""}
          </span>
          {!review && (
            <button
              className="text-button"
              onClick={() => {
                worker.current?.terminate();
                setLoading(false);
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
      {errors.length > 0 && (
        <details className="notice warning" open>
          <summary>
            <AlertTriangle size={16} /> {errors.length} filas o incidencias que
            requieren revisión
          </summary>
          <ul>
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {errors.length > 30 && (
            <p>Y {errors.length - 30} más. Revisa el archivo de origen.</p>
          )}
        </details>
      )}
      {review && (
        <>
          <div className="import-summary">
            <span>
              <strong>{candidates.filter((c) => c.selected).length}</strong>{" "}
              seleccionados
            </span>
            <span>
              <strong>
                {candidates.filter((c) => c.duplicate !== "none").length}
              </strong>{" "}
              duplicados posibles o exactos
            </span>
            <span>
              <strong>{candidates.filter((c) => !c.selected).length}</strong>{" "}
              descartados
            </span>
          </div>
          <p className="muted">
            Los duplicados posibles empiezan desmarcados. Puedes incluir compras
            legítimas iguales. Corrige fecha, concepto e importe antes de
            guardar.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Incluir</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Importe</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {candidates
                  .slice(previewPage * 50, previewPage * 50 + 50)
                  .map((c, offset) => {
                    const i = previewPage * 50 + offset;
                    return (
                      <tr key={c.movement.id}>
                        <td>
                          <input
                            aria-label={`Incluir fila ${c.row}`}
                            type="checkbox"
                            disabled={c.duplicate === "exact"}
                            checked={c.selected}
                            onChange={(e) =>
                              setCandidates(
                                candidates.map((r, j) =>
                                  j === i
                                    ? { ...r, selected: e.target.checked }
                                    : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Fecha fila ${c.row}`}
                            type="date"
                            defaultValue={c.movement.date}
                            onBlur={(e) =>
                              editCandidate(i, "date", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Concepto fila ${c.row}`}
                            defaultValue={c.movement.description}
                            onBlur={(e) =>
                              editCandidate(i, "description", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="amount-input"
                            aria-label={`Importe fila ${c.row}`}
                            defaultValue={money(
                              c.movement.amount,
                              c.movement.currency,
                            ).replace(/[^\d,.-]/g, "")}
                            onBlur={(e) =>
                              editCandidate(i, "amount", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          {c.duplicate === "exact"
                            ? "Ya importado"
                            : c.duplicate === "possible"
                              ? "Posible duplicado"
                              : "Nuevo"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              disabled={previewPage === 0}
              onClick={() => setPreviewPage(previewPage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {previewPage + 1} de{" "}
              {Math.max(1, Math.ceil(candidates.length / 50))}
            </span>
            <button
              disabled={(previewPage + 1) * 50 >= candidates.length}
              onClick={() => setPreviewPage(previewPage + 1)}
            >
              Siguiente
            </button>
          </div>
          {Object.keys(editErrors).length > 0 && (
            <p className="notice warning">
              Corrige los campos editados no válidos antes de importar:{" "}
              {Object.values(editErrors).join(" · ")}
            </p>
          )}
          <div className="modal-actions">
            {!initial && (
              <button
                className="button secondary"
                onClick={() => {
                  setEditErrors({});
                  setReview(false);
                }}
              >
                Volver a columnas
              </button>
            )}
            <button
              className="button primary"
              disabled={
                loading ||
                Object.keys(editErrors).length > 0 ||
                !candidates.some((c) => c.selected)
              }
              onClick={save}
            >
              <Check size={17} /> Importar{" "}
              {candidates.filter((c) => c.selected).length} movimientos
            </button>
          </div>
        </>
      )}
      <p className="privacy-foot">
        <X size={13} /> Ningún archivo se envía a un servidor.
      </p>
    </Modal>
  );
}
