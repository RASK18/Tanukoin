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
import { buildCandidates, defaultProfile, duplicateChecker } from "./parse";
import {
  detectImport,
  detectionPrompt,
  validateDetectedProfile,
} from "./detect";
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
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    const check = duplicateChecker(data.movements);
    return (
      initial?.map((movement, i) => ({
        movement,
        row: i + 1,
        ...check(movement),
      })) || []
    );
  });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState<{
    phase: string;
    done?: number;
    total?: number;
  }>();
  const savingRef = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const savingHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (saving) savingHeading.current?.focus();
  }, [!!saving]);
  const [detection, setDetection] = useState("");
  const generation = useRef(0);
  const [errors, setErrors] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [review, setReview] = useState(!!initial),
    [progress, setProgress] = useState(0),
    [previewPage, setPreviewPage] = useState(0);
  const [editErrors, setEditErrors] = useState<Record<number, string>>({});
  const worker = useRef<Worker | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  function read(selected: File, separator = delimiter) {
    const current = ++generation.current;
    setDelimiter(separator);
    setDetection("");
    setEditErrors({});
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
    worker.current.onmessage = async (e) => {
      if (current !== generation.current) return;
      if (e.data.progress) setProgress(e.data.progress);
      if (e.data.error) {
        setErrors([e.data.error]);
        setLoading(false);
      }
      if (e.data.result) {
        const result: ParsedFile = e.data.result;
        const detected = detectImport(result);
        let note = detected.complete
          ? "Columnas y formatos detectados automáticamente en tu dispositivo."
          : "No se han reconocido todas las columnas. Revisa las opciones avanzadas.";
        try {
          if (!detected.complete && (await db.models.get("chat"))?.ready) {
            const { completion } = await import("../ai/client");
            const sample = result.sheets[detected.sheet].rows
              .slice(0, 15)
              .map((row) => row.slice(0, 20).map((cell) => cell.slice(0, 120)));
            const answer = await completion(
              detectionPrompt,
              JSON.stringify(sample),
              true,
            );
            const suggested = validateDetectedProfile(
              JSON.parse(answer),
              result.sheets[detected.sheet].rows,
            );
            if (suggested) {
              detected.profile = suggested;
              note =
                "Columnas detectadas por la IA local y comprobadas con las filas del archivo.";
            } else
              note =
                "La propuesta de la IA no es válida. Revisa las opciones avanzadas.";
          }
        } catch {
          note =
            "La IA local no está disponible. Revisa la detección en opciones avanzadas.";
        }
        if (current !== generation.current) return;
        setParsed(result);
        setSheet(detected.sheet);
        setPages(
          result.normalizedPdf
            ? result.sheets.map((_, index) => index)
            : [detected.sheet],
        );
        setProfile(detected.profile);
        setDetection(note);
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
      const result = buildCandidates(
        s.rows,
        profile,
        target,
        parsed!.name,
        data.movements,
      );
      all.push(...result.candidates);
      failures.push(...result.errors.map((e) => `${s.name}: ${e}`));
    }
    setCandidates(all);
    setErrors(failures);
    setReview(true);
    setPreviewPage(0);
  }
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveFailed(false);
    setLoading(true);
    setSaving({ phase: "Preparando movimientos" });
    const importId = crypto.randomUUID();
    const success = await run(
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const selected = candidates.filter(
          (c) => c.selected && c.duplicate !== "exact",
        );
        let prepared: Movement[] = [];
        for (let i = 0; i < selected.length; i += 250) {
          prepared.push(
            ...selected
              .slice(i, i + 250)
              .map((c) => applyRules({ ...c.movement, importId }, data.rules)),
          );
          setSaving({
            phase: "Aplicando reglas",
            done: prepared.length,
            total: selected.length,
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if ((await db.models.get("embeddings"))?.ready) {
          try {
            setSaving({ phase: "Preparando la IA local" });
            const { categorize } = await import("../ai/client");
            prepared = await categorize(
              prepared,
              data.categories,
              data.movements,
              (done, total) =>
                setSaving({
                  phase: "Analizando movimientos con IA local",
                  done,
                  total,
                }),
            );
          } catch {
            notify(
              "La IA no está disponible. Se importarán los movimientos con tus reglas; puedes categorizarlos después.",
            );
          }
        }
        setSaving({ phase: "Comprobando identificadores bancarios" });
        await db.transaction("rw", db.movements, async () => {
          const savedExternal = new Set(
            (await db.movements.toArray())
              .filter((m) => m.externalId)
              .map((m) => JSON.stringify([m.accountId, m.externalId])),
          );
          const pending = prepared.filter(
            (m) =>
              !m.externalId ||
              !savedExternal.has(JSON.stringify([m.accountId, m.externalId])),
          );
          setSaving({
            phase: "Guardando movimientos",
            done: 0,
            total: pending.length,
          });
          for (let i = 0; i < pending.length; i += 250) {
            await db.movements.bulkAdd(pending.slice(i, i + 250));
            setSaving({
              phase: "Guardando movimientos",
              done: Math.min(i + 250, pending.length),
              total: pending.length,
            });
          }
        });
      })(),
      "Movimientos importados. Todo se ha guardado en este navegador.",
    );
    setLoading(false);
    savingRef.current = false;
    setSaving(undefined);
    setSaveFailed(!success);
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
      next[index] = {
        ...next[index],
        movement,
        ...(fingerprint(next[index].movement) !== movement.fingerprint
          ? {
              balanceMissing: false,
              ...duplicateChecker(data.movements)(movement),
            }
          : {}),
      };
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
        <span className={!review && !saving ? "active" : ""}>
          1. Archivo y vista previa
        </span>
        <ArrowRight size={15} />
        <span className={review && !saving ? "active" : ""}>
          2. Revisar e importar
        </span>
        <ArrowRight size={15} />
        <span className={saving ? "active" : ""}>3. Importando</span>
      </div>
      {!review && !saving && (
        <>
          <label
            className={`dropzone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node))
                setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length !== 1) {
                notify("Suelta un solo archivo cada vez.");
                return;
              }
              read(e.dataTransfer.files[0], "");
            }}
          >
            <Upload size={28} />
            <strong>
              {file?.name ||
                "Arrastra aquí tu extracto o haz clic para elegirlo"}
            </strong>
            <span>
              CSV, Excel o PDF con texto · Máximo 100 MB · Tu archivo no se sube
            </span>
            <input
              aria-label="Archivo bancario"
              type="file"
              accept=".csv,.tsv,.xls,.xlsx,.pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) read(e.target.files[0], "");
              }}
            />
            <span className="file-choice" aria-hidden="true">
              {file ? "Cambiar archivo" : "Elegir archivo"}
            </span>
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
              </div>
              <p className="muted" role="status">
                {detection}
              </p>
              <details className="import-advanced">
                <summary>Opciones avanzadas</summary>
                <div className="form-grid">
                  <Field label="Hoja / página">
                    <select
                      value={sheet}
                      onChange={(e) => {
                        const index = Number(e.target.value);
                        setSheet(index);
                        setProfile(
                          detectImport({
                            ...parsed,
                            sheets: [parsed.sheets[index]],
                          }).profile,
                        );
                      }}
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
                          data.profiles.find(
                            (p) => p.id === e.target.value,
                          ) || {
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
                    balance: "Saldo",
                  }).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <select
                        value={
                          profile.columns[
                            key as keyof typeof profile.columns
                          ] ?? -1
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
              </details>
              <h3>Vista previa</h3>
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
      {saving && (
        <section
          className="import-progress"
          aria-label="Progreso de importación"
        >
          <h3 ref={savingHeading} tabIndex={-1}>
            Importando tus movimientos
          </h3>
          <div role="status" aria-live="polite" aria-atomic="true">
            <p>{saving.phase}…</p>
            {saving.total !== undefined && saving.done !== undefined && (
              <p>
                {saving.done} de {saving.total} movimientos · Quedan{" "}
                {saving.total - saving.done} en esta fase
              </p>
            )}
          </div>
          <progress
            aria-label={saving.phase}
            max={saving.total || 1}
            value={saving.done}
          />
          <p className="muted">
            Mantén esta ventana abierta hasta que termine. Todo se procesa en tu
            dispositivo.
          </p>
        </section>
      )}
      {loading && !saving && (
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
                generation.current++;
                worker.current?.terminate();
                setLoading(false);
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      )}
      {errors.length > 0 && !saving && (
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
      {review && !saving && (
        <>
          {saveFailed && (
            <p className="notice warning" role="alert">
              No se ha guardado ningún movimiento de esta importación. Tu
              selección se conserva; puedes volver a intentarlo.
            </p>
          )}
          <div className="import-summary">
            <span>
              <strong>{candidates.filter((c) => c.selected).length}</strong>{" "}
              seleccionados
            </span>
            <span>
              <strong>
                {candidates.filter((c) => c.duplicate !== "none").length}
              </strong>{" "}
              coincidencias con movimientos guardados
            </span>
            <span>
              <strong>{candidates.filter((c) => !c.selected).length}</strong>{" "}
              descartados
            </span>
          </div>
          <p className="muted">
            Solo comparamos con movimientos ya guardados en esta cuenta: fecha,
            importe, concepto y saldo. Las repeticiones dentro del archivo se
            conservan. Si falta el saldo en alguno de los dos, la coincidencia
            queda seleccionada para que la revises.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Incluir</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Importe</th>
                  <th>Saldo</th>
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
                          {c.movement.balance === undefined
                            ? "—"
                            : money(c.movement.balance, c.movement.currency)}
                        </td>
                        <td>
                          {c.duplicate === "exact"
                            ? "Ya importado"
                            : c.duplicate === "possible"
                              ? c.balanceMissing
                                ? "Revisar coincidencia: falta saldo"
                                : "Posible duplicado"
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
                Volver a vista previa
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
