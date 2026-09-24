import {
  assignCategory,
  changeTags,
  saveEditedMovement,
} from "../data/classification";
import {
  categoryTree,
  makeTag,
  matchesTags,
  movementSearchText,
  type TagMode,
} from "../lib/classification";
import { TagChips, TagFilter, TagPicker } from "../components/Classification";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Upload,
  Download,
  Search,
  Pencil,
  Trash2,
  Link2,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  useApp,
  PageTitle,
  Empty,
  CategoryBadge,
  CategorySelect,
  AccountSelect,
  Field,
  Modal,
} from "../components/ui";
import { db, removeMovements } from "../data/db";
import type { Movement, Relation, Tag } from "../data/types";
import {
  money,
  displayDate,
  normalize,
  parseAmount,
  parseTime,
  parseExchangeRate,
  fingerprint,
  validateRelation,
  currencyDigits,
} from "../lib/finance";
import { csvCell, download } from "../lib/backup";
import { semanticSearch } from "../features/ai/client";
import {
  compareMovements,
  orderMovements,
  orderGroup,
  orderWarning,
  uncertainOrderGroups,
} from "../lib/movement-order";
export function Movements({ onImport }: { onImport: () => void }) {
  const { data, run, notify } = useApp();
  const [params] = useSearchParams();
  const tree = useMemo(() => categoryTree(data.categories), [data.categories]);
  const [filterTags, setFilterTags] = useState<string[]>([]),
    [tagMode, setTagMode] = useState<TagMode>("all"),
    [batchTags, setBatchTags] = useState<string[]>([]);
  const [query, setQuery] = useState(params.get("buscar") || ""),
    [account, setAccount] = useState(""),
    [category, setCategory] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [currency, setCurrency] = useState(""),
    [page, setPage] = useState(0),
    [sort, setSort] = useState("date-desc"),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<Movement>(),
    [batchCategory, setBatchCategory] = useState(""),
    [relationType, setRelationType] = useState<Relation["type"]>("transfer"),
    [semanticIds, setSemanticIds] = useState<string[] | null>(null),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    setQuery(params.get("buscar") || "");
    const m = data.movements.find((m) => m.id === params.get("id"));
    if (m) setEditing(m);
  }, [params]);
  useEffect(() => {
    setPage(0);
    setSemanticIds(null);
  }, [query, account, category, from, to, currency, filterTags, tagMode]);
  const categoryIds = useMemo(() => tree.branch(category), [tree, category]);
  const rows = useMemo(
    () =>
      orderMovements(data.movements, sort !== "date-asc")
        .filter(
          (m) =>
            (semanticIds
              ? semanticIds.includes(m.id)
              : !query ||
                movementSearchText(m, tree, data.tags).includes(
                  normalize(query),
                )) &&
            (!account || m.accountId === account) &&
            (!category ||
              (category === "uncategorized"
                ? !m.categoryId
                : !!m.categoryId && categoryIds.has(m.categoryId))) &&
            matchesTags(m, filterTags, tagMode) &&
            (!from || m.date >= from) &&
            (!to || m.date <= to) &&
            (!currency || m.currency === currency),
        )
        .sort((a, b) =>
          sort === "amount" ? a.amount - b.amount || compareMovements(b, a) : 0,
        ),
    [
      data,
      query,
      account,
      category,
      from,
      to,
      sort,
      semanticIds,
      currency,
      tree,
      categoryIds,
      filterTags,
      tagMode,
    ],
  );
  const visible = rows.slice(page * 30, page * 30 + 30);
  const uncertainGroups = useMemo(
    () => uncertainOrderGroups(data.movements),
    [data.movements],
  );
  async function link() {
    try {
      const members = data.movements.filter((m) => selected.includes(m.id));
      validateRelation(relationType, members);
      if (
        relationType !== "related" &&
        data.relations.some(
          (r) =>
            r.type !== "related" &&
            r.movementIds.some((id) => selected.includes(id)),
        )
      )
        throw new Error(
          "Quita primero las relaciones contables anteriores de estos movimientos.",
        );
      await run(
        db.relations.add({
          id: crypto.randomUUID(),
          type: relationType,
          movementIds: selected,
        }),
        "Movimientos vinculados",
      );
      setSelected([]);
    } catch (e) {
      notify(String(e));
    }
  }
  function exportCsv() {
    const content = [
      [
        "Fecha principal",
        "Concepto",
        "Contraparte",
        "Importe",
        "Moneda",
        "Cuenta",
        "Categoría",
        "Notas",
        "Saldo",
        "Etiquetas",
        "Fecha secundaria",
        "Importe original",
        "Moneda original",
        "Hora principal",
        "Hora secundaria",
        "Comisión",
        "Tipo de cambio aplicado",
        "Origen del saldo",
      ],
      ...rows.map((m) => [
        m.date,
        m.description,
        m.merchant,
        (m.amount / 10 ** currencyDigits(m.currency))
          .toFixed(currencyDigits(m.currency))
          .replace(".", ","),
        m.currency,
        data.accounts.find((a) => a.id === m.accountId)?.name,
        tree.path(m.categoryId),
        m.notes,
        m.balance === undefined
          ? ""
          : (m.balance / 10 ** currencyDigits(m.currency))
              .toFixed(currencyDigits(m.currency))
              .replace(".", ","),
        m.tagIds
          .map((id) => data.tags.find((t) => t.id === id)?.name)
          .filter(Boolean)
          .join(" | "),
        m.secondaryDate || "",
        m.originalAmount === undefined || !m.originalCurrency
          ? ""
          : (m.originalAmount / 10 ** currencyDigits(m.originalCurrency))
              .toFixed(currencyDigits(m.originalCurrency))
              .replace(".", ","),
        m.originalCurrency || "",
        m.time || "",
        m.secondaryTime || "",
        m.fee === undefined
          ? ""
          : (m.fee / 10 ** currencyDigits(m.currency))
              .toFixed(currencyDigits(m.currency))
              .replace(".", ","),
        m.exchangeRate || "",
        m.balanceSource === "calculated" ? "Calculado" : "",
      ]),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n");
    download(
      "tanukoin-movimientos.csv",
      "\uFEFF" + content,
      "text/csv;charset=utf-8",
    );
  }
  return (
    <>
      <PageTitle
        illustration="tanu-presentando"
        title="Tus movimientos"
        description="Encuentra, ordena y da contexto a cada pequeño movimiento."
        action={
          <div className="button-row">
            <button
              className="button secondary"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              <Download size={16} /> Exportar
            </button>
            <button className="button primary" onClick={onImport}>
              <Upload size={16} /> Importar
            </button>
          </div>
        }
      />
      <section className="card">
        <div className="filters">
          <label className="search-input">
            <Search size={16} />
            <input
              aria-label="Filtrar movimientos"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Concepto, categoría o etiqueta…"
            />
          </label>
          <AccountSelect
            value={account}
            onChange={setAccount}
            data={data}
            all
          />
          <CategorySelect
            label="Filtrar categoría"
            value={category}
            onChange={setCategory}
            categories={data.categories}
            emptyLabel="Todas las categorías"
            filter
          />
          <TagFilter
            tags={data.tags}
            value={filterTags}
            mode={tagMode}
            onChange={setFilterTags}
            onModeChange={setTagMode}
          />
          <input
            aria-label="Desde"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            aria-label="Hasta"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <select
            aria-label="Filtrar moneda"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">Todas las monedas</option>
            {[...new Set(data.accounts.map((a) => a.currency))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            className="button secondary"
            disabled={!query || searching}
            onClick={async () => {
              setSearching(true);
              try {
                setSemanticIds(
                  (await semanticSearch(query, data.movements)).map(
                    (r) => r.movement.id,
                  ),
                );
              } catch (e) {
                notify(String(e));
              } finally {
                setSearching(false);
              }
            }}
          >
            <Sparkles size={15} />
            {searching ? "Buscando…" : "Búsqueda semántica"}
          </button>
        </div>
        <div className="table-toolbar">
          <span>
            {rows.length} movimientos {semanticIds && "· búsqueda semántica"}
          </span>
          <select
            aria-label="Ordenar movimientos"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="date-desc">Extracto: más recientes primero</option>
            <option value="date-asc">Extracto: más antiguos primero</option>
            <option value="amount">Por importe (sin conversión)</option>
          </select>
        </div>
        {selected.length > 0 && (
          <div className="batch-bar">
            <strong>{selected.length} seleccionados</strong>
            <CategorySelect
              value={batchCategory}
              onChange={setBatchCategory}
              categories={data.categories}
            />
            <button
              className="button small"
              onClick={() =>
                run(
                  assignCategory(selected, batchCategory),
                  "Categorías actualizadas",
                )
              }
            >
              Asignar
            </button>
            <TagPicker
              label="Etiquetas para el lote"
              value={batchTags}
              onChange={setBatchTags}
              tags={data.tags}
            />
            <button
              className="button small"
              disabled={!batchTags.length}
              onClick={() =>
                run(
                  changeTags(selected, batchTags, "add"),
                  "Etiquetas añadidas",
                )
              }
            >
              Añadir etiquetas
            </button>
            <button
              className="button small"
              disabled={!batchTags.length}
              onClick={() =>
                run(
                  changeTags(selected, batchTags, "remove"),
                  "Etiquetas retiradas",
                )
              }
            >
              Quitar etiquetas
            </button>
            <select
              aria-label="Tipo de relación"
              value={relationType}
              onChange={(e) =>
                setRelationType(e.target.value as Relation["type"])
              }
            >
              <option value="transfer">Transferencia interna</option>
              <option value="refund">Devolución</option>
              <option value="related">Relacionados</option>
            </select>
            <button className="button small" onClick={link}>
              <Link2 size={14} />
              Vincular
            </button>
            <button
              className="button small danger"
              onClick={() => {
                if (
                  confirm(
                    `¿Eliminar ${selected.length} movimientos y sus vínculos?`,
                  )
                )
                  void run(
                    removeMovements(selected),
                    "Movimientos eliminados",
                  ).then((ok) => {
                    if (ok) setSelected([]);
                  });
              }}
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          </div>
        )}
        {rows.some((m) => uncertainGroups.has(orderGroup(m))) && (
          <p className="notice" role="status">
            {orderWarning}
          </p>
        )}
        {rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        aria-label="Seleccionar página"
                        type="checkbox"
                        checked={
                          visible.length > 0 &&
                          visible.every((m) => selected.includes(m.id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...selected,
                                    ...visible.map((m) => m.id),
                                  ]),
                                ]
                              : selected.filter(
                                  (id) => !visible.some((m) => m.id === id),
                                ),
                          )
                        }
                      />
                    </th>
                    <th>Fecha principal</th>
                    <th>Movimiento</th>
                    <th>Categoría</th>
                    <th>Cuenta</th>
                    <th className="align-right">Importe</th>
                    <th
                      className="align-right"
                      title="Saldo tras el movimiento. Se indica cuando es calculado en lugar de proceder del extracto."
                    >
                      Saldo
                    </th>
                    <th>Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <input
                          aria-label={`Seleccionar ${m.description}`}
                          type="checkbox"
                          checked={selected.includes(m.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, m.id]
                                : selected.filter((id) => id !== m.id),
                            )
                          }
                        />
                      </td>
                      <td className="nowrap">
                        {displayDate(m.date)}
                        {m.time && <small>{m.time}</small>}
                      </td>
                      <td>
                        <strong className="row-title">
                          {m.merchant || m.description}
                        </strong>
                        {m.merchant && <small>{m.description}</small>}
                        {m.notes && (
                          <small className="note-text">{m.notes}</small>
                        )}
                        <div className="movement-tags">
                          <TagChips ids={m.tagIds} tags={data.tags} />
                        </div>
                        <span className="row-symbols">
                          {data.relations.some((r) =>
                            r.movementIds.includes(m.id),
                          ) && <Link2 size={12} />}{" "}
                          {data.assignments.some(
                            (a) => a.movementId === m.id,
                          ) && <MapPin size={12} />}
                        </span>
                      </td>
                      <td>
                        <CategoryBadge
                          id={m.categoryId}
                          categories={data.categories}
                        />
                        {m.categorySource === "ai" && (
                          <small>Asignada por IA · revisable</small>
                        )}
                        {m.aiSuggestion && m.categorySource !== "ai" && (
                          <button
                            className="suggestion"
                            onClick={() =>
                              run(
                                assignCategory(
                                  [m.id],
                                  m.aiSuggestion!.categoryId,
                                ),
                                "Sugerencia confirmada",
                              )
                            }
                          >
                            Aceptar:{" "}
                            {
                              data.categories.find(
                                (c) => c.id === m.aiSuggestion?.categoryId,
                              )?.name
                            }
                          </button>
                        )}
                      </td>
                      <td>
                        {data.accounts.find((a) => a.id === m.accountId)?.name}
                      </td>
                      <td
                        className={`amount align-right ${m.amount > 0 ? "positive" : ""}`}
                      >
                        {money(m.amount, m.currency)}
                      </td>
                      <td className="align-right nowrap">
                        {m.balance === undefined ? (
                          <span aria-label="Saldo no disponible">—</span>
                        ) : (
                          <>
                            {money(m.balance, m.currency)}
                            {m.balanceSource === "calculated" && (
                              <small>Calculado</small>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${m.description}`}
                          onClick={() => setEditing({ ...m })}
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>
                Página {page + 1} de {Math.ceil(rows.length / 30)}
              </span>
              <button
                disabled={(page + 1) * 30 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          </>
        ) : (
          <Empty
            title={
              data.movements.length
                ? "No hay coincidencias"
                : "Todavía no hay movimientos"
            }
            action={
              !data.movements.length && (
                <button className="button primary" onClick={onImport}>
                  Importar extracto
                </button>
              )
            }
          >
            {data.movements.length
              ? "Prueba con otro período o filtro."
              : "Importa un archivo bancario para comenzar."}
          </Empty>
        )}
      </section>
      {editing && (
        <MovementEditor
          movement={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
function MovementEditor({
  movement,
  onClose,
}: {
  movement: Movement;
  onClose: () => void;
}) {
  const { data, run, notify, setDirty } = useApp();
  const [m, setM] = useState(movement);
  const [categoryChanged, setCategoryChanged] = useState(false);
  const [pendingTags, setPendingTags] = useState<Tag[]>([]);
  const [saveError, setSaveError] = useState("");
  const [fee, setFee] = useState(
    m.fee === undefined
      ? ""
      : (m.fee / 10 ** currencyDigits(m.currency))
          .toFixed(currencyDigits(m.currency))
          .replace(".", ","),
  );
  const [exchangeRate, setExchangeRate] = useState(m.exchangeRate || "");
  const [originalAmount, setOriginalAmount] = useState(
    m.originalAmount === undefined || !m.originalCurrency
      ? ""
      : (m.originalAmount / 10 ** currencyDigits(m.originalCurrency))
          .toFixed(currencyDigits(m.originalCurrency))
          .replace(".", ","),
  );
  const [amount, setAmount] = useState(
    (m.amount / 10 ** currencyDigits(m.currency))
      .toFixed(currencyDigits(m.currency))
      .replace(".", ","),
  );
  return (
    <Modal
      title="Editar movimiento"
      onClose={() => {
        setDirty(false);
        onClose();
      }}
    >
      <form
        data-editor
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const next = {
              ...m,
              amount: parseAmount(amount, ",", m.currency),
              fee: fee.trim() ? parseAmount(fee, ",", m.currency) : undefined,
              exchangeRate: parseExchangeRate(exchangeRate),
              originalAmount: originalAmount.trim()
                ? parseAmount(originalAmount, ",", m.originalCurrency || "EUR")
                : undefined,
            };
            next.fingerprint = fingerprint(next);
            if (
              await run(
                saveEditedMovement(next, categoryChanged, pendingTags).catch(
                  (e) => {
                    setSaveError(e instanceof Error ? e.message : String(e));
                    throw e;
                  },
                ),
                "Movimiento guardado",
              )
            )
              onClose();
          } catch (error) {
            setSaveError(
              error instanceof Error ? error.message : String(error),
            );
          }
        }}
      >
        <div className="form-grid">
          <Field label="Fecha principal">
            <input
              type="date"
              required
              value={m.date}
              onChange={(e) => setM({ ...m, date: e.target.value })}
            />
          </Field>
          <Field label="Fecha secundaria">
            <input
              type="date"
              value={m.secondaryDate || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  secondaryDate: e.target.value || undefined,
                  secondaryTime: e.target.value ? m.secondaryTime : undefined,
                })
              }
            />
          </Field>
          <Field label="Hora principal">
            <input
              type="time"
              step="any"
              value={m.time || ""}
              onChange={(e) => setM({ ...m, time: parseTime(e.target.value) })}
            />
          </Field>
          <Field label="Hora secundaria">
            <input
              type="time"
              step="any"
              disabled={!m.secondaryDate}
              value={m.secondaryTime || ""}
              onChange={(e) =>
                setM({ ...m, secondaryTime: parseTime(e.target.value) })
              }
            />
          </Field>
          <Field label={`Importe · ${m.currency}`}>
            <input
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label={`Comisión · ${m.currency}`}>
            <input
              aria-label={`Comisión · ${m.currency}`}
              aria-describedby="movement-fee-help"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
            <small id="movement-fee-help">
              Incluida en el importe. Editarla no cambia el importe neto.
            </small>
          </Field>
          <Field label="Tipo de cambio aplicado">
            <input
              aria-label="Tipo de cambio aplicado"
              aria-describedby="movement-exchange-rate-help"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              placeholder="0,85 o 1 EUR = 0,85 GBP"
            />
            <small id="movement-exchange-rate-help">
              Tal como figura en el extracto, sin recalcular importes.
            </small>
          </Field>
          <Field label="Importe original">
            <input
              inputMode="decimal"
              value={originalAmount}
              onChange={(e) => setOriginalAmount(e.target.value)}
            />
          </Field>
          <Field label="Moneda original">
            <input
              value={m.originalCurrency || ""}
              maxLength={3}
              placeholder="USD, GBP, JPY…"
              onChange={(e) =>
                setM({
                  ...m,
                  originalCurrency:
                    e.target.value.trim().toUpperCase() || undefined,
                })
              }
            />
          </Field>
          <Field label="Concepto original">
            <input
              required
              value={m.description}
              onChange={(e) => setM({ ...m, description: e.target.value })}
            />
          </Field>
          <Field label="Contraparte">
            <input
              value={m.merchant}
              onChange={(e) => setM({ ...m, merchant: e.target.value })}
            />
          </Field>
          <Field label="Categoría">
            <CategorySelect
              value={m.categoryId || ""}
              onChange={(id) => {
                setDirty(true);
                setCategoryChanged(true);
                setM({ ...m, categoryId: id || undefined });
              }}
              categories={data.categories}
            />
          </Field>
        </div>
        <div className="field">
          <span>Etiquetas</span>
          <TagPicker
            tags={[...data.tags, ...pendingTags]}
            value={m.tagIds}
            onChange={(tagIds) => {
              setDirty(true);
              setM({ ...m, tagIds });
            }}
            onCreate={(name) => {
              const existing = [...data.tags, ...pendingTags].find(
                (t) => t.normalizedName === normalize(name),
              );
              const tag = existing || makeTag(name);
              if (!existing) setPendingTags([...pendingTags, tag]);
              setDirty(true);
              setM({ ...m, tagIds: [...new Set([...m.tagIds, tag.id])] });
            }}
          />
        </div>
        <Field label="Notas">
          <textarea
            value={m.notes}
            onChange={(e) => setM({ ...m, notes: e.target.value })}
          />
        </Field>
        <p className="muted">
          Origen: {m.source} · Los cambios de categoría manuales quedan
          protegidos.
        </p>
        {data.relations
          .filter((r) => r.movementIds.includes(m.id))
          .map((r) => (
            <div className="notice" key={r.id}>
              <Link2 size={15} />
              {r.type === "transfer"
                ? "Transferencia interna"
                : r.type === "refund"
                  ? "Devolución"
                  : "Movimientos relacionados"}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  run(db.relations.delete(r.id), "Vínculo eliminado")
                }
              >
                Quitar vínculo
              </button>
            </div>
          ))}
        {saveError && (
          <p className="notice" role="alert">
            {saveError}
          </p>
        )}
        <div className="modal-actions">
          <button className="button primary">Guardar cambios</button>
        </div>
      </form>
    </Modal>
  );
}
