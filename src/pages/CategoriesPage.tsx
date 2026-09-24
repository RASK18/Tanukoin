import {
  Fragment,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  X,
  Check,
  Search,
  Expand,
  FoldVertical,
} from "lucide-react";
import type { Category } from "../data/types";
import {
  deleteCategoryBranch,
  deletionImpact,
  moveCategory,
  saveCategory,
  updateCategoryDetails,
  type CategoryDrop,
} from "../data/classification";
import { categoryTree } from "../lib/classification";
import { categoryEmoji, categoryEmojis } from "../lib/category-emoji";
import { normalize } from "../lib/finance";
import { Empty, Field, Modal, PageTitle, useApp } from "../components/ui";
import { useCategoryDrag } from "./useCategoryDrag";
import "./categories-page.css";

function EmojiPicker({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const [popup, setPopup] = useState({ left: 0, width: 270, above: false });
  function positionPopup() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(270, innerWidth - 32),
      left = rect.left + window.scrollX;
    setPopup({
      width,
      left: Math.max(8, Math.min(left, innerWidth - width - 8)) - left,
      above: innerHeight - rect.bottom < 275 && rect.top > 275,
    });
  }
  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("resize", positionPopup);
    return () => window.removeEventListener("resize", positionPopup);
  }, [open]);
  return (
    <div
      className="emoji-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="emoji-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          if (!open) positionPopup();
          setOpen(!open);
        }}
      >
        {categoryEmoji(value)}
      </button>
      {open && (
        <div
          className="emoji-popover"
          role="group"
          aria-label="Elegir emoji"
          style={{
            left: popup.left,
            width: popup.width,
            top: popup.above ? undefined : "calc(100% + 5px)",
            bottom: popup.above ? "calc(100% + 5px)" : undefined,
          }}
        >
          <input
            autoFocus
            aria-label="Buscar emoji"
            placeholder="Buscar emoji…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="emoji-grid">
            {categoryEmojis
              .filter(
                ([emoji, name]) =>
                  normalize(name).includes(normalize(search)) ||
                  emoji === search,
              )
              .map(([emoji, name]) => (
                <button
                  key={emoji}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={categoryEmoji(value) === emoji}
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                    setSearch("");
                    trigger.current?.focus();
                  }}
                >
                  {emoji}
                </button>
              ))}
          </div>
          {!categoryEmojis.some(
            ([emoji, name]) =>
              normalize(name).includes(normalize(search)) || emoji === search,
          ) && <small>No hay emojis con ese nombre.</small>}
        </div>
      )}
    </div>
  );
}

function CategoryFields({
  category,
  creating,
  path,
  onDirty,
  onSaved,
  onCancel,
  locked = false,
  prefix,
  actions,
  count,
}: {
  prefix?: ReactNode;
  actions?: ReactNode;
  count?: number;
  locked?: boolean;
  category: Category;
  creating: boolean;
  path: string;
  onDirty: (id: string, dirty: boolean) => void;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { notify } = useApp();
  const [name, setName] = useState(category.name),
    [icon, setIcon] = useState(category.icon),
    [color, setColor] = useState(category.color),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
  }, [category.name, category.icon, category.color]);
  const changed =
    creating ||
    name !== category.name ||
    icon !== category.icon ||
    color !== category.color;
  return (
    <form
      className={"category-fields" + (changed ? " is-editing" : "")}
      aria-label={creating ? "Nueva categoría" : "Editar " + path}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
          if (creating)
            await saveCategory({ ...category, name, icon, color }, true);
          else await updateCategoryDetails(category.id, { name, icon, color });
          onDirty(category.id, false);
          onSaved();
          notify("Categoría guardada");
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset disabled={saving || locked}>
        <div className="category-name-cell">
          {prefix}
          <EmojiPicker
            value={icon}
            label={"Emoji de " + (creating ? "nueva categoría" : path)}
            onChange={(value) => {
              setIcon(value);
              onDirty(
                category.id,
                creating ||
                  value !== category.icon ||
                  name !== category.name ||
                  color !== category.color,
              );
            }}
          />
          <div
            className={"category-name-edit" + (changed ? " has-changes" : "")}
          >
            <input
              className="category-name"
              aria-label={
                creating ? "Nombre de nueva categoría" : "Nombre de " + path
              }
              autoFocus={creating}
              required
              value={name}
              placeholder="Nombre de la categoría"
              onChange={(e) => {
                setName(e.target.value);
                onDirty(
                  category.id,
                  creating ||
                    e.target.value !== category.name ||
                    icon !== category.icon ||
                    color !== category.color,
                );
              }}
            />
            {changed && (
              <div className="category-save">
                <button
                  className="button primary small"
                  disabled={saving}
                  type="submit"
                >
                  <Check size={14} />
                  {saving ? "Guardando…" : "Guardar"}
                </button>
                <button
                  className="icon-button category-cancel"
                  type="button"
                  aria-label={
                    creating
                      ? "Cancelar nueva categoría"
                      : "Descartar cambios de " + path
                  }
                  onClick={() => {
                    setName(category.name);
                    setIcon(category.icon);
                    setColor(category.color);
                    setError("");
                    onDirty(category.id, false);
                    onCancel?.();
                  }}
                >
                  <X size={18} strokeWidth={3} />
                </button>
              </div>
            )}
          </div>
        </div>
        <label
          className="category-color"
          title="Color en movimientos y gráficos"
        >
          <input
            type="color"
            aria-label={"Color de " + (creating ? "nueva categoría" : path)}
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              onDirty(
                category.id,
                creating ||
                  e.target.value !== category.color ||
                  name !== category.name ||
                  icon !== category.icon,
              );
            }}
          />
        </label>
        <span
          className="category-count"
          aria-label={(count || 0) + " movimientos en la rama"}
        >
          {creating ? "—" : count || 0}
        </span>
        <div className="category-row-actions">{!creating && actions}</div>
      </fieldset>
      {error && (
        <p className="category-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Categories() {
  const { data, notify, setDirty } = useApp();
  const tree = useMemo(() => categoryTree(data.categories), [data.categories]);
  const [draft, setDraft] = useState<Category>();
  const [dirtyIds, setDirtyIds] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [search, setSearch] = useState("");
  const [description, setDescription] = useState<{
    id: string;
    text: string;
  }>();
  const [deleting, setDeleting] = useState<{
    category: Category;
    impact: ReturnType<typeof deletionImpact>;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = useMemo(() => {
    if (!search.trim()) return undefined;
    const ids = new Set<string>();
    for (const c of data.categories)
      if (normalize(c.name).includes(normalize(search)))
        for (const p of tree.ancestors(c.id)) ids.add(p.id);
    return ids;
  }, [search, tree, data.categories]);
  const visible = tree.options.filter(({ category: c }) =>
    matches
      ? matches.has(c.id)
      : !tree
          .ancestors(c.id)
          .slice(0, -1)
          .some((p) => collapsed.has(p.id)),
  );
  async function place(id: string, drop: CategoryDrop) {
    setBusy(true);
    setError("");
    try {
      await moveCategory(id, drop);
      if (drop.position === "inside" && drop.targetId)
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(drop.targetId!);
          return next;
        });
      notify("Categoría movida");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const { list, drag, startPointer, startKeyboard, keyboard } = useCategoryDrag(
    visible,
    place,
  );
  useEffect(() => {
    setDirty(busy || !!draft || dirtyIds.size > 0 || !!description || !!drag);
    return () => setDirty(false);
  }, [busy, draft, dirtyIds, description, drag, setDirty]);
  function markDirty(id: string, dirty: boolean) {
    setDirtyIds((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function create(parent?: Category) {
    setError("");
    setSearch("");
    if (parent)
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parent.id);
        return next;
      });
    setDraft({
      id: crypto.randomUUID(),
      name: "",
      description: "",
      icon: "📁",
      color: parent?.color || "#6f9c7f",
      parentId: parent?.id,
    });
  }
  const blocked = !!draft || dirtyIds.size > 0 || busy;
  const rows = drag?.remaining || visible;
  function guides(id: string, depth: number) {
    const chain = tree.ancestors(id);
    return (
      <span className="tree-guides" aria-hidden="true">
        {Array.from({ length: depth }, (_, level) => {
          const node = chain[level + 1];
          const siblings = (
            tree.children.get(node?.parentId || "") || []
          ).filter((c) => !matches || matches.has(c.id));
          const last = siblings.at(-1)?.id === node?.id;
          return (
            <span
              key={level}
              style={{ "--level": level } as CSSProperties}
              className={
                "tree-guide" +
                (level === depth - 1 ? " elbow" : "") +
                (last ? " last" : "")
              }
            />
          );
        })}
      </span>
    );
  }
  const draftRow = (depth: number) =>
    draft && (
      <li
        className="category-editor-row is-new"
        key={draft.id}
        style={{ "--depth": depth } as CSSProperties}
      >
        <CategoryFields
          category={draft}
          creating
          path=""
          prefix={
            <span className="category-new-mark">
              <Plus size={15} />
            </span>
          }
          onDirty={markDirty}
          onSaved={() => setDraft(undefined)}
          onCancel={() => setDraft(undefined)}
        />
      </li>
    );
  const placeholder = drag && (
    <li
      key="placeholder"
      className={"category-placeholder" + (!drag.valid ? " invalid" : "")}
      data-preview-parent={drag.parentId || ""}
      data-preview-index={drag.index}
      style={{ height: drag.height, "--depth": drag.depth } as CSSProperties}
      aria-label="Posición al soltar"
    >
      {drag.branch.map((row) => (
        <div
          className="placeholder-row"
          key={row.category.id}
          style={{
            paddingLeft: (row.depth - drag.branch[0].depth) * 24,
            height: drag.height / drag.branch.length,
          }}
        >
          <span>{categoryEmoji(row.category.icon)}</span>
          {row.category.name}
        </div>
      ))}
    </li>
  );
  return (
    <>
      <PageTitle
        illustration="tanu-presentando"
        title="Cada cosa en su lugar"
        description="Edita tus categorías aquí mismo. Arrastra el asa para ordenar o cambiar de rama."
        action={
          <button
            className="button primary"
            disabled={!!draft || busy || !!drag}
            onClick={() => create()}
          >
            <Plus size={18} /> Nueva categoría
          </button>
        }
      />
      <section className="card category-editor">
        <div className="category-toolbar">
          <label className="category-search">
            <Search size={18} />
            <input
              aria-label="Buscar categorías"
              placeholder="Buscar categorías…"
              value={search}
              disabled={!!draft || !!drag || dirtyIds.size > 0}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!!drag}
              onClick={() => setCollapsed(new Set())}
            >
              <Expand size={15} /> Expandir todo
            </button>
            <button
              className="button secondary"
              disabled={blocked || !!drag}
              onClick={() =>
                setCollapsed(new Set(data.categories.map((c) => c.id)))
              }
            >
              <FoldVertical size={15} /> Contraer todo
            </button>
          </div>
        </div>
        {error && !description && !deleting && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <p className="sr-only" id="category-drag-help">
          Para mover con teclado, pulsa Espacio, usa arriba y abajo para ordenar
          e izquierda y derecha para cambiar de nivel. Enter guarda y Escape
          cancela.
        </p>
        <div className="category-table">
          <div className="category-columns" aria-hidden="true">
            <span>Categoría</span>
            <span>Color</span>
            <span>Movimientos</span>
            <span>Acciones</span>
          </div>
          <ul
            ref={list}
            className={"category-editor-tree" + (drag ? " is-sorting" : "")}
            aria-label="Árbol de categorías"
            tabIndex={-1}
            onKeyDown={keyboard}
          >
            {draft && !draft.parentId && draftRow(0)}
            {rows.map(({ category: c, depth, path }, index) => {
              const branch = tree.branch(c.id);
              const count = data.movements.filter(
                (m) => m.categoryId && branch.has(m.categoryId),
              ).length;
              const hasChildren = !!tree.children.get(c.id)?.length;
              return (
                <Fragment key={c.id}>
                  {drag?.index === index && placeholder}
                  <li
                    className={
                      "category-editor-row" +
                      (depth === 0 ? " is-root" : "") +
                      (drag?.parentId === c.id ? " is-drop-parent" : "")
                    }
                    data-category-id={c.id}
                    data-depth={depth}
                    style={
                      {
                        "--depth": depth,
                        "--category-color": c.color,
                      } as CSSProperties
                    }
                  >
                    {guides(c.id, depth)}
                    <CategoryFields
                      category={c}
                      creating={false}
                      locked={busy}
                      path={path}
                      count={count}
                      onDirty={markDirty}
                      onSaved={() => {}}
                      prefix={
                        <>
                          <button
                            type="button"
                            className="icon-button category-drag"
                            data-grab={c.id}
                            aria-label={"Mover " + path}
                            aria-describedby="category-drag-help"
                            disabled={blocked || !!matches}
                            onPointerDown={(e) => startPointer(e, c.id)}
                            onKeyDown={(e) => startKeyboard(e, c.id)}
                          >
                            <GripVertical size={17} />
                          </button>
                          {hasChildren ? (
                            <button
                              type="button"
                              className="icon-button category-collapse"
                              aria-label={
                                (collapsed.has(c.id)
                                  ? "Expandir "
                                  : "Contraer ") + path
                              }
                              aria-expanded={!!matches || !collapsed.has(c.id)}
                              disabled={blocked || !!drag || !!matches}
                              onClick={() =>
                                setCollapsed((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.id)) next.delete(c.id);
                                  else next.add(c.id);
                                  return next;
                                })
                              }
                            >
                              {collapsed.has(c.id) && !matches ? (
                                <ChevronRight size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </button>
                          ) : (
                            <span className="category-collapse" />
                          )}
                        </>
                      }
                      actions={
                        <>
                          <button
                            type="button"
                            className="category-add"
                            disabled={!!draft || busy || !!drag}
                            aria-label={"Añadir categoría dentro de " + path}
                            onClick={() => create(c)}
                          >
                            <Plus size={19} />
                          </button>
                          <button
                            type="button"
                            className="category-ai"
                            disabled={busy || !!drag}
                            aria-label={"Descripción para la IA de " + path}
                            onClick={() => {
                              setError("");
                              setDescription({ id: c.id, text: c.description });
                            }}
                          >
                            <Sparkles size={16} /> IA
                          </button>
                          <button
                            type="button"
                            className="category-delete"
                            disabled={blocked || !!drag}
                            aria-label={"Eliminar " + path}
                            onClick={() => {
                              setError("");
                              setDeleting({
                                category: c,
                                impact: deletionImpact(
                                  c.id,
                                  data.categories,
                                  data.movements,
                                  data.rules,
                                ),
                              });
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      }
                    />
                  </li>
                  {draft?.parentId === c.id && draftRow(depth + 1)}
                </Fragment>
              );
            })}
            {drag?.index === rows.length && placeholder}
          </ul>
        </div>
        {!rows.length && !drag && !draft && (
          <Empty
            title={
              search
                ? "No hay categorías con ese nombre"
                : "Tu árbol de categorías"
            }
          >
            {search
              ? "Prueba con otro nombre."
              : "Crea una categoría principal para empezar."}
          </Empty>
        )}
        <footer className="category-footer">
          {data.categories.length} categorías en total <span>·</span>{" "}
          {tree.children.get("")?.length || 0} categorías principales{" "}
          <span>·</span> {data.categories.filter((c) => c.parentId).length}{" "}
          subcategorías
        </footer>
        <div className="sr-only" role="status">
          {drag
            ? "Moviendo " +
              drag.branch[0].category.name +
              ". Nivel " +
              (drag.depth + 1) +
              ", posición " +
              (drag.index + 1) +
              ". Enter para guardar, Escape para cancelar."
            : ""}
        </div>
      </section>
      {drag && !drag.keyboard && (
        <div
          className="category-drag-overlay"
          aria-hidden="true"
          style={{
            left: Math.max(8, Math.min(drag.x + 14, window.innerWidth - 300)),
            top: drag.y - 22,
          }}
        >
          <GripVertical size={16} />
          <span>{categoryEmoji(drag.branch[0].category.icon)}</span>
          <strong>{drag.branch[0].category.name}</strong>
          {drag.branch.length > 1 && <small>+{drag.branch.length - 1}</small>}
        </div>
      )}
      {description && (
        <Modal
          title="Descripción para la IA"
          onClose={() => {
            if (!busy) {
              setDescription(undefined);
              setError("");
            }
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await updateCategoryDetails(description.id, {
                  description: description.text,
                });
                setDescription(undefined);
                notify("Descripción guardada");
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>{tree.path(description.id)}</p>
            <Field
              label="Descripción para la IA"
              hint="Palabras que ayudan a reconocer este tipo de movimiento."
            >
              <textarea
                aria-label="Descripción para la IA"
                autoFocus
                value={description.text}
                disabled={busy}
                onChange={(e) =>
                  setDescription({ ...description, text: e.target.value })
                }
              />
            </Field>
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setDescription(undefined);
                  setError("");
                }}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                Guardar descripción
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Eliminar rama de categorías"
          onClose={() => {
            if (!busy) {
              setDeleting(undefined);
              setError("");
            }
          }}
        >
          <p>
            Vas a eliminar <strong>{tree.path(deleting.category.id)}</strong> y
            todas sus categorías descendientes.
          </p>
          <ul>
            <li>
              {deleting.impact.categoryIds.length} categorías se eliminarán.
            </li>
            <li>
              {deleting.impact.movementIds.length} movimientos quedarán sin
              categoría. Se conservarán sus etiquetas y el resto de datos.
            </li>
            <li>
              {deleting.impact.ruleIds.length} reglas se eliminarán por
              completo.
            </li>
          </ul>
          <p>
            También se retirarán las sugerencias de IA de esta rama. Los
            movimientos desasignados quedarán protegidos de la categorización
            automática.
          </p>
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setDeleting(undefined);
                setError("");
              }}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await deleteCategoryBranch(
                    deleting.category.id,
                    deleting.impact,
                  );
                  setDeleting(undefined);
                  notify("Rama eliminada");
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Eliminar rama
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
