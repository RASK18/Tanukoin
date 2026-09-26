import { reconcileImport } from "./reconcile";
import { commitImport, ImportChangedError } from "./commit";
import { getActiveChatModel } from "../ai/model-store";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Plus,
  Sparkles,
  FileSpreadsheet,
  ArrowRight,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import { db } from "../../data/db";
import type { Movement } from "../../data/types";
import { applyRules, money, fingerprint } from "../../lib/finance";
import { useApp, Modal, Field, AccountSelect } from "../../components/ui";
import { buildCandidates, duplicateChecker } from "./parse";
import { prepareImport } from "./prepare";
import { parsePageRanges } from "./page-ranges";
import { AccountDialog } from "../../components/AccountDialog";
import {
  calculateReviewBalances,
  resolveReviewedCandidate,
  refreshReviewNotes,
} from "./review";
import { ReviewTable } from "./ReviewTable";
import {
  orderMovements,
  inferSourceOrder,
  reconcileMovementOrder,
  orderWarning,
} from "../../lib/movement-order";
import {
  detectImport,
  detectionPrompt,
  validateDetectedLayout,
} from "./detect";
import type {
  Candidate,
  ParsedFile,
  DetectedLayout,
  ReviewField,
} from "./types";

export function ImportDialog({
  onClose,
  initial,
}: {
  onClose: () => void;
  initial?: Movement[];
}) {
  const { data, run, notify } = useApp();
  const [reviewSnapshot, setReviewSnapshot] = useState<Movement[]>(
    data.movements,
  );
  const [parsed, setParsed] = useState<ParsedFile>();
  const [file, setFile] = useState<File>();
  const [sheet, setSheet] = useState(0);
  const [pageMode, setPageMode] = useState<"all" | "ranges">("all");
  const [pageRanges, setPageRanges] = useState("");
  const [previewSheet, setPreviewSheet] = useState(0);
  const [account, setAccount] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, DetectedLayout>>(
    {},
  );
  const [aiAvailable, setAiAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void getActiveChatModel()
      .then((model) => {
        if (active) setAiAvailable(!!model);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    const check = duplicateChecker(data.movements);
    return (
      initial?.map((movement, i) => ({
        movement,
        row: i + 1,
        ...check(movement),
        selected: true,
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
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const worker = useRef<Worker | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      worker.current?.terminate();
    },
    [],
  );
  function read(selected: File) {
    const current = ++generation.current;
    if (!account) return;
    setOpeningBalance("");
    setDetection("");
    setEditErrors({});
    setFile(selected);
    setLoading(true);
    setProgress(0);
    setErrors([]);
    setReview(false);
    setParsed(undefined);
    setOverrides({});
    setPageMode("all");
    setPageRanges("");
    setPreviewSheet(0);
    worker.current?.terminate();
    worker.current = new Worker(
      new URL("./import.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current.onmessage = (e) => {
      if (current !== generation.current) return;
      if (e.data.progress) setProgress(e.data.progress);
      if (e.data.error) {
        setErrors([e.data.error]);
        setLoading(false);
      }
      if (e.data.result) {
        const result: ParsedFile = e.data.result;
        const detected = detectImport(result);
        setParsed(result);
        setSheet(detected.sheet);
        setLoading(false);
      }
    };
    worker.current.onerror = () => {
      if (current !== generation.current) return;
      setErrors([
        "No se pudo iniciar el lector local. Comprueba los recursos offline o vuelve a cargar.",
      ]);
      setLoading(false);
    };
    worker.current.postMessage({ file: selected });
  }
  const pageSelection = useMemo(() => {
    if (!parsed) return { indices: [] as number[], error: "" };
    if (parsed.kind !== "pdf") return { indices: [sheet], error: "" };
    try {
      const pages =
        pageMode === "all"
          ? parsed.sheets.map((_, i) => i + 1)
          : parsePageRanges(pageRanges, parsed.sheets.length);
      return { indices: pages.map((p) => p - 1), error: "" };
    } catch (error) {
      return {
        indices: [],
        error: error instanceof Error ? error.message : "Selección no válida",
      };
    }
  }, [parsed, sheet, pageMode, pageRanges]);
  const target = data.accounts.find((a) => a.id === account);
  const previewAccount = useMemo(
    () => target || { id: "preview", name: "", bank: "", currency: "EUR" },
    [target],
  );
  const prepared = useMemo(
    () =>
      parsed
        ? prepareImport(
            parsed,
            previewAccount,
            pageSelection.indices,
            overrides,
            data.movements,
          )
        : undefined,
    [parsed, previewAccount, pageSelection, overrides, data.movements],
  );
  const shown = useMemo(
    () =>
      parsed?.kind === "pdf"
        ? prepareImport(
            parsed,
            previewAccount,
            [previewSheet],
            overrides,
            data.movements,
          )
        : prepared,
    [parsed, previewAccount, previewSheet, overrides, data.movements, prepared],
  );
  const issues = review ? errors : [...errors, ...(prepared?.errors || [])];
  const reviewWarnings = (prepared?.warnings || []).filter((warning) => {
    const related = candidates.flatMap((c) =>
      (c.issues || []).filter(
        (issue) => warning === `${c.sheet}: ${issue.message}`,
      ),
    );
    return !related.length || related.some((issue) => !issue.resolved);
  });
  const reconciliation = useMemo(
    () => reconcileImport(candidates, reviewSnapshot),
    [candidates, reviewSnapshot],
  );
  const needsBalances =
    review &&
    !!parsed &&
    !prepared?.hasSourceBalances &&
    reconciliation.some((c) => c.status === "new" && c.selected);
  const reviewed = useMemo(() => {
    let rows = candidates,
      error = "";
    if (needsBalances) {
      try {
        rows = calculateReviewBalances(candidates, openingBalance);
      } catch (e) {
        error = e instanceof Error ? e.message : "Saldo no válido";
      }
    }
    const byId = new Map(rows.map((c) => [c.movement.id, c]));
    return {
      rows: orderMovements(rows.map((c) => c.movement)).map((m) => ({
        ...byId.get(m.id)!,
        ...reconciliation.find((c) => c.movement.id === m.id)!,
        movement:
          reconciliation.find((c) => c.movement.id === m.id)?.status === "new"
            ? applyRules(m, data.rules)
            : m,
      })),
      error,
    };
  }, [candidates, needsBalances, openingBalance, data.rules, reconciliation]);
  const newCount = reconciliation.filter((c) => c.status === "new").length;
  const updateCount = reconciliation.filter(
    (c) => c.status === "update",
  ).length;
  const blocked = reconciliation.some((c) => c.blocking);
  const saveLabel = updateCount
    ? `Guardar ${newCount} nuevos y ${updateCount} actualizaciones`
    : newCount
      ? `Importar ${newCount} movimientos`
      : "Finalizar revisión";
  const orderPreview = useMemo(() => {
    const rows = review ? reconciliation : [];
    return reconcileMovementOrder(
      data.movements,
      rows.filter((c) => c.status === "new").map((c) => c.movement),
      rows.map((c) => c.movement),
      new Map(
        rows
          .filter((c) => c.target && c.status !== "omit" && !c.blocking)
          .map((c) => [c.movement.id, c.target!.id]),
      ),
    );
  }, [review, reconciliation, data.movements]);
  function preview() {
    if (
      !target ||
      !prepared ||
      pageSelection.error ||
      prepared.errors.length ||
      !prepared.candidates.length
    )
      return;
    setReviewSnapshot(data.movements);
    setCandidates(prepared.candidates.map((c) => ({ ...c, selected: true })));
    setErrors([]);
    setReview(true);
    setPreviewPage(0);
    setSaveFailed(false);
  }
  async function assist() {
    if (!parsed || !prepared || !aiAvailable) return;
    const current = ++generation.current;
    setLoading(true);
    setProgress(0);
    setDetection("La IA local está intentando reconocer las columnas.");
    const next = { ...overrides };
    let recognized = 0;
    try {
      const { completion } = await import("../ai/client");
      for (const index of prepared.unknown) {
        const rows = parsed.sheets[index].rows;
        const sample = rows
          .slice(0, 30)
          .map((row) => row.slice(0, 20).map((cell) => cell.slice(0, 120)));
        const answer = await completion(
          detectionPrompt,
          JSON.stringify(sample),
          true,
        );
        if (current !== generation.current) return;
        const layout = validateDetectedLayout(JSON.parse(answer), rows);
        if (layout) {
          const check = buildCandidates(
            rows,
            layout,
            previewAccount,
            parsed.name,
            [],
          );
          if (check.candidates.length && !check.errors.length) {
            next[index] = layout;
            recognized++;
          }
        }
      }
      setOverrides(next);
      setDetection(
        recognized
          ? "La propuesta de la IA se ha comprobado con las filas del archivo. Revisa los movimientos."
          : "La IA no ha podido reconocer el formato de forma fiable. Elige otro archivo.",
      );
    } catch {
      if (current === generation.current)
        setDetection(
          "La IA local no ha podido reconocer el archivo. Puedes elegir otro formato.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }
  async function save() {
    if (
      savingRef.current ||
      reviewed.error ||
      Object.keys(editErrors).length ||
      blocked ||
      !candidates.length
    )
      return;
    savingRef.current = true;
    setSaveFailed(false);
    setLoading(true);
    setSaving({ phase: "Preparando movimientos" });
    const importId = crypto.randomUUID();
    let orderUncertain = false;
    const success = await run(
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const source = inferSourceOrder(
          reviewed.rows.map((c) => c.movement),
          new Set(
            candidates.filter((c) => c.orderEdited).map((c) => c.movement.id),
          ),
        );
        const inferred = new Map(source.map((m) => [m.id, m]));
        const snapshot = reviewSnapshot;
        const selected = reviewed.rows.filter((c) => c.status === "new");
        let prepared: Movement[] = [];
        for (let i = 0; i < selected.length; i += 250) {
          prepared.push(
            ...selected
              .slice(i, i + 250)
              .map((c) =>
                applyRules(
                  { ...inferred.get(c.movement.id)!, importId },
                  data.rules,
                ),
              ),
          );
          setSaving({
            phase: "Aplicando reglas",
            done: prepared.length,
            total: selected.length,
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (prepared.length && (await db.models.get("embeddings"))?.ready) {
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
        setSaving({ phase: "Comprobando movimientos" });
        const documentId = file
          ? Array.from(
              new Uint8Array(
                await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
              ),
              (b) => b.toString(16).padStart(2, "0"),
            ).join("")
          : importId;
        try {
          orderUncertain = await commitImport(
            reviewed.rows,
            snapshot,
            prepared,
            source,
            documentId,
            (done, total) =>
              setSaving({ phase: "Guardando movimientos", done, total }),
          );
        } catch (error) {
          if (error instanceof ImportChangedError) {
            setReviewSnapshot(await db.movements.toArray());
            setCandidates((rows) =>
              rows.map((c) => ({
                ...c,
                decision: undefined,
                resolutions: undefined,
              })),
            );
          }
          throw error;
        }
      })(),
      "Movimientos importados. Todo se ha guardado en este navegador.",
    );
    setLoading(false);
    savingRef.current = false;
    setSaving(undefined);
    setSaveFailed(!success);
    if (success) {
      if (orderUncertain) notify(orderWarning);
      onClose();
    }
  }
  function editCandidate(id: string, key: ReviewField, value: string) {
    const index = candidates.findIndex((c) => c.movement.id === id);
    const candidate = candidates[index];
    if (!candidate) return;
    const edits = { ...candidate.edits, [key]: value };
    const next = [...candidates];
    try {
      const resolved = resolveReviewedCandidate(candidate, edits);
      const movement = resolved.movement;
      next[index] = {
        ...resolved,
        resolutions: undefined,
        orderEdited:
          candidate.orderEdited ||
          movement.amount !== candidate.movement.amount ||
          movement.balance !== candidate.movement.balance,
      };
      setEditErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (e) {
      next[index] = refreshReviewNotes({
        ...candidate,
        edits,
        issues: candidate.issues?.map((issue) =>
          issue.fields.includes(key) ? { ...issue, resolved: false } : issue,
        ),
      });
      setEditErrors((current) => ({
        ...current,
        [id]: e instanceof Error ? e.message : "Dato no válido",
      }));
    }
    setCandidates(next);
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
          1. Cuenta, archivo y vista previa
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
          <div className="import-account-row">
            <Field label="Cuenta de destino">
              <AccountSelect
                value={account}
                onChange={(id) => {
                  setAccount(id);
                  setOpeningBalance("");
                }}
                data={data}
              />
            </Field>
            <button
              type="button"
              className="button secondary"
              onClick={() => setCreatingAccount(true)}
            >
              <Plus size={16} /> Crear cuenta
            </button>
          </div>
          {!data.accounts.length && (
            <p className="muted">
              Elige o crea una cuenta para poder seleccionar el archivo.
            </p>
          )}
          {target && (
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
                read(e.dataTransfer.files[0]);
              }}
            >
              <Upload size={28} />
              <strong>
                {file?.name ||
                  "Arrastra aquí tu extracto o haz clic para elegirlo"}
              </strong>
              <span>
                CSV, Excel o PDF con texto · Máximo 100 MB · Tu archivo no se
                sube
              </span>
              <input
                aria-label="Archivo bancario"
                type="file"
                accept=".csv,.tsv,.xls,.xlsx,.pdf"
                onChange={(e) => {
                  if (e.target.files?.[0]) read(e.target.files[0]);
                }}
              />
              <span className="file-choice" aria-hidden="true">
                {file ? "Cambiar archivo" : "Elegir archivo"}
              </span>
            </label>
          )}
          {parsed && (
            <>
              {parsed.kind === "pdf" ? (
                <div
                  className="pdf-page-selection"
                  role="group"
                  aria-label="Páginas que se importarán"
                >
                  <div className="button-row">
                    <label>
                      <input
                        type="radio"
                        name="pdf-pages"
                        checked={pageMode === "all"}
                        onChange={() => setPageMode("all")}
                      />{" "}
                      Todas las páginas
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="pdf-pages"
                        checked={pageMode === "ranges"}
                        onChange={() => setPageMode("ranges")}
                      />{" "}
                      Elegir páginas
                    </label>
                  </div>
                  {pageMode === "ranges" && (
                    <>
                      <input
                        aria-label="Páginas"
                        type="text"
                        className="pdf-page-ranges"
                        value={pageRanges}
                        onChange={(e) => setPageRanges(e.target.value)}
                        placeholder="1-8, 12, 20-29"
                        aria-invalid={!!pageSelection.error}
                        aria-describedby="pdf-range-help pdf-range-error"
                      />
                    </>
                  )}
                  {pageMode === "ranges" && (
                    <p id="pdf-range-help" className="muted">
                      Ej.: 1-8, 12, 20-29
                    </p>
                  )}
                  <p
                    id="pdf-range-error"
                    role={pageSelection.error ? "alert" : undefined}
                  >
                    {pageSelection.error}
                  </p>
                  {!pageSelection.error && (
                    <p role="status">
                      {pageSelection.indices.length} de {parsed.sheets.length}{" "}
                      páginas seleccionadas
                      {!!prepared?.informational &&
                        ` · ${prepared.informational} páginas informativas sin movimientos`}
                    </p>
                  )}
                </div>
              ) : (
                parsed.sheets.length > 1 && (
                  <Field label="Hoja">
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
                )
              )}
              {!!prepared?.unknown.length && (
                <div className="notice warning">
                  <p>
                    No se ha reconocido el formato de {prepared.unknown.length}{" "}
                    hojas o páginas.
                  </p>
                  {aiAvailable ? (
                    <button
                      className="button secondary"
                      disabled={loading}
                      onClick={assist}
                    >
                      <Sparkles size={16} /> Intentar con IA local
                    </button>
                  ) : (
                    <p>
                      No hay un modelo local preparado. Puedes elegir otro
                      archivo; los formatos reconocidos no necesitan IA.
                    </p>
                  )}
                </div>
              )}
              {detection && (
                <p className="muted" role="status">
                  {detection}
                </p>
              )}
              <div className="import-preview-heading">
                <h3>Vista previa</h3>
                {parsed.kind === "pdf" && (
                  <div className="field">
                    <select
                      aria-label="Vista previa de página"
                      value={previewSheet}
                      onChange={(e) => setPreviewSheet(Number(e.target.value))}
                    >
                      {parsed.sheets.map((s, i) => (
                        <option value={i} key={i}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {shown?.informational ? (
                <p className="muted">
                  Página informativa, sin movimientos que importar.
                </p>
              ) : (
                <div className="table-scroll preview-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha principal</th>
                        <th>Concepto</th>
                        <th>Importe</th>
                        <th>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown?.candidates.slice(0, 6).map((c) => (
                        <tr key={c.movement.id}>
                          <td>
                            {c.movement.date}
                            {c.movement.time && (
                              <small>Hora: {c.movement.time}</small>
                            )}
                            {c.movement.secondaryDate && (
                              <small>
                                Secundaria: {c.movement.secondaryDate}
                                {c.movement.secondaryTime
                                  ? ` · ${c.movement.secondaryTime}`
                                  : ""}
                              </small>
                            )}
                          </td>
                          <td>{c.movement.description}</td>
                          <td>
                            {money(c.movement.amount, c.movement.currency)}
                            {c.movement.fee !== undefined && (
                              <small>
                                Comisión:{" "}
                                {money(c.movement.fee, c.movement.currency)}
                              </small>
                            )}
                            {c.movement.exchangeRate && (
                              <small>
                                Tipo de cambio aplicado:{" "}
                                {c.movement.exchangeRate}
                              </small>
                            )}
                            {c.movement.originalAmount !== undefined &&
                              c.movement.originalCurrency && (
                                <small>
                                  Original:{" "}
                                  {money(
                                    c.movement.originalAmount,
                                    c.movement.originalCurrency,
                                  )}
                                </small>
                              )}
                          </td>
                          <td>
                            {c.movement.balance === undefined
                              ? "—"
                              : money(c.movement.balance, c.movement.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!shown?.candidates.length && (
                    <p className="muted">
                      No hay movimientos reconocidos en esta vista.
                    </p>
                  )}
                </div>
              )}
              {!!prepared?.warnings.length && (
                <details className="notice warning">
                  <summary>
                    {prepared.warnings.length} avisos del archivo
                  </summary>
                  <ul>
                    {prepared.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="modal-actions">
                <button
                  className="button primary"
                  disabled={
                    !target ||
                    loading ||
                    !!pageSelection.error ||
                    !!prepared?.errors.length ||
                    !prepared?.candidates.length
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
      {orderPreview.uncertain && !saving && (
        <p className="notice" role="status">
          {orderWarning}
        </p>
      )}
      {issues.length > 0 && !saving && (
        <details className="notice warning" open>
          <summary>
            <AlertTriangle size={16} /> {issues.length} filas o incidencias que
            requieren revisión
          </summary>
          <ul>
            {issues.slice(0, 30).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {issues.length > 30 && (
            <p>Y {issues.length - 30} más. Revisa el archivo de origen.</p>
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
              <strong>{newCount}</strong> nuevos
            </span>
            <span>
              <strong>{reconciliation.filter((c) => !!c.target).length}</strong>{" "}
              coincidencias con movimientos guardados
            </span>
            <span>
              <strong>{updateCount}</strong> actualizaciones
            </span>
            <button
              className="button primary import-review-submit"
              disabled={
                loading ||
                Object.keys(editErrors).length > 0 ||
                !!reviewed.error ||
                blocked ||
                !candidates.length
              }
              onClick={save}
            >
              <Check size={17} /> {saveLabel}
            </button>
          </div>
          {!!reviewWarnings.length && (
            <details className="notice warning">
              <summary>{reviewWarnings.length} avisos del archivo</summary>
              <ul>
                {reviewWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <ReviewTable
            saved={reviewSnapshot}
            onDecision={(id, decision) =>
              setCandidates((rows) =>
                rows.map((c) =>
                  c.movement.id === id
                    ? { ...c, decision, selected: true, resolutions: undefined }
                    : c,
                ),
              )
            }
            onResolve={(id, key, value) =>
              setCandidates((rows) =>
                rows.map((c) =>
                  c.movement.id === id
                    ? { ...c, resolutions: { ...c.resolutions, [key]: value } }
                    : c,
                ),
              )
            }
            candidates={reviewed.rows.slice(
              previewPage * 50,
              previewPage * 50 + 50,
            )}
            onEdit={editCandidate}
            onSelect={(id, selected) =>
              setCandidates((rows) =>
                rows.map((c) =>
                  c.movement.id === id ? { ...c, selected } : c,
                ),
              )
            }
            opening={openingBalance}
            onOpening={setOpeningBalance}
            calculate={needsBalances}
            balanceError={reviewed.error}
            errors={editErrors}
          />
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
          </div>
        </>
      )}
      {creatingAccount && (
        <AccountDialog
          onClose={() => setCreatingAccount(false)}
          onSaved={(created) => {
            setAccount(created.id);
            setCreatingAccount(false);
          }}
        />
      )}
      <p className="privacy-foot">
        <X size={13} /> Ningún archivo se envía a un servidor.
      </p>
    </Modal>
  );
}
