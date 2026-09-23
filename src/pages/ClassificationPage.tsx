import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { Category, Tag } from "../data/types";
import {
  deleteCategoryBranch,
  deletionImpact,
  saveCategory,
  deleteTag,
  saveTag,
} from "../data/classification";
import { categoryTree } from "../lib/classification";
import { normalize } from "../lib/finance";
import {
  CategoryIcon,
  CategorySelect,
  Empty,
  Field,
  Modal,
  PageTitle,
  useApp,
} from "../components/ui";

export function Categories() {
  const { data, run, setDirty } = useApp();
  const [error, setError] = useState("");
  const tree = useMemo(() => categoryTree(data.categories), [data.categories]);
  const [editing, setEditing] = useState<{
    category: Category;
    creating: boolean;
  }>();
  const [deleting, setDeleting] = useState<{
    category: Category;
    impact: ReturnType<typeof deletionImpact>;
  }>();
  const [collapsed, setCollapsed] = useState(new Set<string>());
  function create(parent?: Category) {
    setError("");
    setEditing({
      creating: true,
      category: {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        color: parent?.color || "#6f9c7f",
        icon: parent?.icon || "Folder",
        parentId: parent?.id,
      },
    });
  }
  const category = editing?.category;
  const original = category && tree.byId.get(category.id);
  const moving = original && original.parentId !== category?.parentId;
  const editedBranch = category ? tree.branch(category.id) : new Set<string>();
  const close = () => {
    setEditing(undefined);
    setDirty(false);
    setError("");
  };
  return (
    <>
      <PageTitle
        title="Cada cosa en su lugar"
        description="Una categoría describe el tipo de movimiento. Organízalas en tantos niveles como necesites."
        action={
          <button className="button primary" onClick={() => create()}>
            <Plus size={16} /> Nueva categoría
          </button>
        }
      />
      <section className="card">
        <div className="card-heading">
          <h2>Categorías</h2>
          <div className="button-row">
            <button
              className="text-button"
              onClick={() => setCollapsed(new Set())}
            >
              Expandir todo
            </button>
            <button
              className="text-button"
              onClick={() =>
                setCollapsed(new Set(data.categories.map((c) => c.id)))
              }
            >
              Contraer todo
            </button>
          </div>
        </div>
        <ul className="classification-tree" aria-label="Árbol de categorías">
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
              return (
                <li
                  key={c.id}
                  className="classification-row"
                  style={{ paddingLeft: Math.min(depth * 18, 72) }}
                >
                  {hasChildren ? (
                    <button
                      className="icon-button"
                      aria-label={`${collapsed.has(c.id) ? "Expandir" : "Contraer"} ${path}`}
                      aria-expanded={!collapsed.has(c.id)}
                      onClick={() =>
                        setCollapsed((previous) => {
                          const next = new Set(previous);
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
                    <span aria-hidden="true" style={{ width: 32 }} />
                  )}
                  <span style={{ color: c.color }}>
                    <CategoryIcon name={c.icon} />
                  </span>
                  <div className="category-info">
                    <strong>{c.name}</strong>
                    <small>
                      {path} · {count} movimientos
                      {hasChildren ? " en la rama" : ""}
                    </small>
                  </div>
                  <div className="button-row">
                    <button
                      className="icon-button"
                      aria-label={`Añadir categoría dentro de ${path}`}
                      onClick={() => create(c)}
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Editar ${path}`}
                      onClick={() =>
                        setEditing({ category: { ...c }, creating: false })
                      }
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Eliminar ${path}`}
                      onClick={() =>
                        setDeleting({
                          category: c,
                          impact: deletionImpact(
                            c.id,
                            data.categories,
                            data.movements,
                            data.rules,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
        </ul>
        {!data.categories.length && (
          <Empty title="Tu árbol de categorías">
            Crea una categoría principal para empezar.
          </Empty>
        )}
      </section>
      {editing && category && (
        <Modal
          title={editing.creating ? "Nueva categoría" : "Editar categoría"}
          onClose={close}
        >
          <form
            data-editor
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  saveCategory(category, editing.creating).catch((e) => {
                    setError(e instanceof Error ? e.message : String(e));
                    throw e;
                  }),
                  "Categoría guardada",
                )
              )
                close();
            }}
          >
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  required
                  value={category.name}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: { ...category, name: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Categoría padre">
                <CategorySelect
                  label="Categoría padre"
                  value={category.parentId || ""}
                  categories={data.categories}
                  emptyLabel="Categoría principal"
                  excluded={[...editedBranch]}
                  onChange={(id) => {
                    setDirty(true);
                    setEditing({
                      ...editing,
                      category: { ...category, parentId: id || undefined },
                    });
                  }}
                />
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: { ...category, color: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Icono">
                <select
                  value={category.icon}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      category: { ...category, icon: e.target.value },
                    })
                  }
                >
                  {[
                    "Folder",
                    "House",
                    "ShoppingBasket",
                    "TrainFront",
                    "Utensils",
                    "Gamepad2",
                    "HeartPulse",
                    "ShoppingBag",
                    "Wallet",
                    "Ellipsis",
                  ].map((icon) => (
                    <option key={icon}>{icon}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Descripción para la IA"
              hint="Palabras que ayudan a reconocer este tipo de movimiento."
            >
              <textarea
                value={category.description}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    category: { ...category, description: e.target.value },
                  })
                }
              />
            </Field>
            {moving && (
              <div className="notice" role="status">
                <div>
                  <strong>Se moverá toda la rama</strong>
                  <p>
                    Antes: {tree.path(category.id)}
                    <br />
                    Después:{" "}
                    {categoryTree([
                      ...data.categories.filter((c) => c.id !== category.id),
                      category,
                    ]).path(category.id)}
                  </p>
                  <p>
                    {editedBranch.size - 1} categorías descendientes y{" "}
                    {
                      data.movements.filter(
                        (m) => m.categoryId && editedBranch.has(m.categoryId),
                      ).length
                    }{" "}
                    movimientos conservarán sus asignaciones.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                Cancelar
              </button>
              <button className="button primary">Guardar categoría</button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Eliminar rama de categorías"
          onClose={() => {
            setDeleting(undefined);
            setError("");
          }}
        >
          <p>
            Vas a eliminar{" "}
            <strong>
              {tree.path(deleting.category.id) || deleting.category.name}
            </strong>{" "}
            y todas sus categorías descendientes.
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
              onClick={() => {
                setDeleting(undefined);
                setError("");
              }}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              onClick={async () => {
                if (
                  await run(
                    deleteCategoryBranch(
                      deleting.category.id,
                      deleting.impact,
                    ).catch((e) => {
                      setError(e instanceof Error ? e.message : String(e));
                      throw e;
                    }),
                    "Rama eliminada",
                  )
                ) {
                  setDeleting(undefined);
                  setError("");
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

export function TagsPage() {
  const { data, run, setDirty } = useApp();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ tag: Tag; creating: boolean }>();
  const [deleting, setDeleting] = useState<Tag>();
  const [search, setSearch] = useState("");
  const close = () => {
    setEditing(undefined);
    setDirty(false);
    setError("");
  };
  return (
    <>
      <PageTitle
        title="Conecta tus movimientos"
        description="Las etiquetas agrupan movimientos de cualquier categoría: un viaje, una persona o un proyecto."
        action={
          <button
            className="button primary"
            onClick={() =>
              setEditing({
                creating: true,
                tag: { id: crypto.randomUUID(), name: "", normalizedName: "" },
              })
            }
          >
            <Plus size={16} /> Nueva etiqueta
          </button>
        }
      />
      <section className="card">
        <Field label="Buscar etiquetas">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Vacaciones Japón, Laura…"
          />
        </Field>
        <ul className="classification-tree">
          {[...data.tags]
            .filter((t) => normalize(t.name).includes(normalize(search)))
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map((tag) => (
              <li className="classification-row" key={tag.id}>
                <div className="category-info">
                  <strong>{tag.name}</strong>
                  <small>
                    {
                      data.movements.filter((m) => m.tagIds.includes(tag.id))
                        .length
                    }{" "}
                    movimientos
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Editar ${tag.name}`}
                  onClick={() =>
                    setEditing({ tag: { ...tag }, creating: false })
                  }
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${tag.name}`}
                  onClick={() => setDeleting(tag)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
        </ul>
        {!data.tags.length && (
          <Empty title="Agrupa lo que tiene relación">
            Crea etiquetas aquí o al editar un movimiento. Puedes asignar varias
            a la vez.
          </Empty>
        )}
      </section>
      {editing && (
        <Modal
          title={editing.creating ? "Nueva etiqueta" : "Editar etiqueta"}
          onClose={close}
        >
          <form
            data-editor
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await run(
                  saveTag(editing.tag, editing.creating).catch((e) => {
                    setError(e instanceof Error ? e.message : String(e));
                    throw e;
                  }),
                  "Etiqueta guardada",
                )
              )
                close();
            }}
          >
            <Field label="Nombre">
              <input
                required
                value={editing.tag.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tag: { ...editing.tag, name: e.target.value },
                  })
                }
              />
            </Field>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={close}
              >
                Cancelar
              </button>
              <button className="button primary">Guardar etiqueta</button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Eliminar etiqueta" onClose={() => setDeleting(undefined)}>
          <p>
            Se eliminará «{deleting.name}» de{" "}
            {
              data.movements.filter((m) => m.tagIds.includes(deleting.id))
                .length
            }{" "}
            movimientos. Sus categorías y las demás etiquetas se conservarán.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleting(undefined)}
            >
              Cancelar
            </button>
            <button
              className="button danger"
              onClick={async () => {
                if (await run(deleteTag(deleting.id), "Etiqueta eliminada"))
                  setDeleting(undefined);
              }}
            >
              Eliminar etiqueta
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
