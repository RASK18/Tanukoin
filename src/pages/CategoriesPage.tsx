import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
        onClick={() => setOpen(!open)}
      >
        {categoryEmoji(value)}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="emoji-popover" role="group" aria-label="Elegir emoji">
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
}: {
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
      className="category-fields"
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
          <span>Color</span>
        </label>
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
              className="icon-button"
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
              <X size={16} />
            </button>
          </div>
        )}
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
  const [description, setDescription] = useState<{
    id: string;
    text: string;
  }>();
  const [deleting, setDeleting] = useState<{
    category: Category;
    impact: ReturnType<typeof deletionImpact>;
  }>();
  const [moving, setMoving] = useState<string>();
  const [hover, setHover] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pointer = useRef<
    { x: number; y: number; dragged: boolean } | undefined
  >(undefined);
  useEffect(() => {
    setDirty(busy || !!draft || dirtyIds.size > 0 || !!description);
    return () => setDirty(false);
  }, [busy, draft, dirtyIds, description, setDirty]);
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
    setMoving(undefined);
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
  const excluded = moving ? tree.branch(moving) : new Set<string>();
  async function place(drop: CategoryDrop) {
    if (!moving || busy) return;
    setBusy(true);
    setError("");
    try {
      await moveCategory(moving, drop);
      if (drop.targetId)
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(drop.targetId!);
          return next;
        });
      notify(
        "Categoría movida; sus movimientos y reglas conservan la asignación.",
      );
      setMoving(undefined);
      setHover(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function dropButton(drop: CategoryDrop, label: string, className = "") {
    const key = (drop.targetId || "root") + ":" + drop.position;
    return (
      <button
        type="button"
        data-category-drop={key}
        data-target={drop.targetId || ""}
        data-position={drop.position}
        className={
          "category-drop " + className + (hover === key ? " is-over" : "")
        }
        disabled={busy}
        onClick={() => void place(drop)}
      >
        {label}
      </button>
    );
  }
  const draftRow = (depth: number) =>
    draft && (
      <li
        key={draft.id}
        className="category-editor-row is-new"
        style={{ "--depth": Math.min(depth, 4) } as CSSProperties}
      >
        <span className="category-new-label">
          {draft.parentId
            ? "Nueva subcategoría · " + tree.path(draft.parentId)
            : "Nueva categoría principal"}
        </span>
        <CategoryFields
          category={draft}
          creating
          path=""
          onDirty={markDirty}
          onSaved={() => setDraft(undefined)}
          onCancel={() => setDraft(undefined)}
        />
      </li>
    );
  return (
    <>
      <PageTitle
        title="Cada cosa en su lugar"
        description="Edita tus categorías aquí mismo. Arrastra el asa para ordenar o cambiar de rama."
        action={
          <button
            className="button primary"
            disabled={!!draft || busy}
            onClick={() => create()}
          >
            <Plus size={16} /> Nueva categoría
          </button>
        }
      />
      <section
        className="card category-editor"
        onKeyDown={(e) => {
          if (e.key === "Escape" && moving) {
            setMoving(undefined);
            setHover(undefined);
          }
        }}
      >
        <div className="card-heading">
          <div>
            <h2>Categorías</h2>
            <p className="category-help">
              Nombre, emoji y color a un clic. El botón + crea una hija.
            </p>
          </div>
          <div className="button-row">
            <button
              className="text-button"
              onClick={() => setCollapsed(new Set())}
            >
              Expandir todo
            </button>
            <button
              className="text-button"
              disabled={blocked}
              onClick={() =>
                setCollapsed(new Set(data.categories.map((c) => c.id)))
              }
            >
              Contraer todo
            </button>
          </div>
        </div>
        {moving && (
          <div className="category-moving" role="status">
            <span>
              Moviendo <strong>{tree.path(moving)}</strong>. Suelta sobre un
              destino o selecciónalo con Tab y Enter.
            </span>
            <button
              className="text-button"
              onClick={() => {
                setMoving(undefined);
                setHover(undefined);
              }}
            >
              Cancelar movimiento
            </button>
          </div>
        )}
        {blocked && !busy && (
          <p className="category-help">
            Guarda o descarta los cambios pendientes antes de mover categorías.
          </p>
        )}
        {error && !description && !deleting && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {moving &&
          dropButton(
            { position: "inside" },
            "Convertir en categoría principal",
            "category-root-drop",
          )}
        <ul className="category-editor-tree" aria-label="Árbol de categorías">
          {draft && !draft.parentId && draftRow(0)}
          {tree.options
            .filter(
              ({ category: c }) =>
                !tree
                  .ancestors(c.id)
                  .slice(0, -1)
                  .some((p) => collapsed.has(p.id)),
            )
            .map(({ category: c, depth, path }) => {
              const branch = tree.branch(c.id),
                hasChildren = !!tree.children.get(c.id)?.length;
              const count = data.movements.filter(
                (m) => m.categoryId && branch.has(m.categoryId),
              ).length;
              const canDrop = !!moving && !excluded.has(c.id);
              return (
                <li
                  key={c.id}
                  className={
                    "category-branch" + (moving === c.id ? " is-moving" : "")
                  }
                  style={{ "--depth": Math.min(depth, 4) } as CSSProperties}
                >
                  {canDrop &&
                    dropButton(
                      { targetId: c.id, position: "before" },
                      "Colocar antes de " + path,
                      "category-order-drop",
                    )}
                  <div className="category-editor-row" data-category-id={c.id}>
                    <div className="category-row-main">
                      <button
                        type="button"
                        className="icon-button category-drag"
                        aria-label={"Mover " + path}
                        aria-pressed={moving === c.id}
                        disabled={blocked}
                        title="Arrastra o pulsa para elegir un destino"
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          pointer.current = {
                            x: e.clientX,
                            y: e.clientY,
                            dragged: false,
                          };
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          const p = pointer.current;
                          if (!p) return;
                          if (
                            Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5
                          ) {
                            p.dragged = true;
                            setMoving(c.id);
                          }
                          if (!p.dragged) return;
                          const el = document
                            .elementFromPoint(e.clientX, e.clientY)
                            ?.closest<HTMLElement>("[data-category-drop]");
                          setHover(el?.dataset.categoryDrop);
                          if (e.clientY < 70) window.scrollBy(0, -18);
                          if (e.clientY > window.innerHeight - 70)
                            window.scrollBy(0, 18);
                        }}
                        onPointerUp={(e) => {
                          const dragged = pointer.current?.dragged;
                          pointer.current = undefined;
                          if (dragged) {
                            const el = document
                              .elementFromPoint(e.clientX, e.clientY)
                              ?.closest<HTMLElement>("[data-category-drop]");
                            if (el)
                              void place({
                                targetId: el.dataset.target || undefined,
                                position: el.dataset
                                  .position as CategoryDrop["position"],
                              });
                          }
                        }}
                        onPointerCancel={() => {
                          pointer.current = undefined;
                          setMoving(undefined);
                          setHover(undefined);
                        }}
                        onClick={(e) => {
                          if (e.detail === 0 || !moving) {
                            setMoving(c.id);
                            setError("");
                          }
                        }}
                      >
                        <GripVertical size={18} />
                      </button>
                      {hasChildren ? (
                        <button
                          className="icon-button category-collapse"
                          aria-label={
                            (collapsed.has(c.id) ? "Expandir " : "Contraer ") +
                            path
                          }
                          aria-expanded={!collapsed.has(c.id)}
                          disabled={blocked}
                          onClick={() =>
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id);
                              else next.add(c.id);
                              return next;
                            })
                          }
                        >
                          {collapsed.has(c.id) ? (
                            <ChevronRight size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                        </button>
                      ) : (
                        <span className="category-collapse" />
                      )}
                      <CategoryFields
                        category={c}
                        locked={!!moving || busy}
                        creating={false}
                        path={path}
                        onDirty={markDirty}
                        onSaved={() => {}}
                      />
                    </div>
                    <div className="category-row-meta">
                      <small title={path}>
                        {count} movimientos{hasChildren ? " en la rama" : ""}
                        {depth > 0 && " · " + tree.path(c.parentId)}
                      </small>
                      <div className="category-row-actions">
                        <button
                          className="text-button"
                          disabled={!!draft || busy}
                          aria-label={"Añadir categoría dentro de " + path}
                          onClick={() => create(c)}
                        >
                          <Plus size={15} /> Hija
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          aria-label={"Descripción para la IA de " + path}
                          onClick={() => {
                            setError("");
                            setDescription({ id: c.id, text: c.description });
                          }}
                        >
                          <Sparkles size={15} /> IA
                        </button>
                        <button
                          className="icon-button"
                          disabled={blocked}
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
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {canDrop &&
                      dropButton(
                        { targetId: c.id, position: "inside" },
                        "Mover dentro de " + path,
                        "category-inside-drop",
                      )}
                  </div>
                  {canDrop &&
                    dropButton(
                      { targetId: c.id, position: "after" },
                      "Colocar después de " + path,
                      "category-order-drop",
                    )}
                  {draft?.parentId === c.id && (
                    <ul className="category-editor-tree">{draftRow(1)}</ul>
                  )}
                </li>
              );
            })}
        </ul>
        {!data.categories.length && !draft && (
          <Empty title="Tu árbol de categorías">
            Crea una categoría principal para empezar.
          </Empty>
        )}
      </section>
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
