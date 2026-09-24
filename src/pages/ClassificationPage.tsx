import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Tag } from "../data/types";
import { deleteTag, saveTag } from "../data/classification";
import { normalize } from "../lib/finance";
import { Empty, Field, Modal, PageTitle, useApp } from "../components/ui";
import "./tags-page.css";
export { Categories } from "./CategoriesPage";

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
        illustration="tanu-saltando-de-alegria"
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
      <section className="card tags-page">
        <label className="tags-search">
          <Search size={21} aria-hidden="true" />
          <input
            type="search"
            className="tags-search-input"
            aria-label="Buscar etiquetas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar etiquetas…"
          />
        </label>
        <ul className="tags-grid">
          {[...data.tags]
            .filter((t) => normalize(t.name).includes(normalize(search)))
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map((tag) => (
              <li className="tag-card" key={tag.id}>
                <div className="tag-card-info">
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
                  <Pencil size={20} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Eliminar ${tag.name}`}
                  onClick={() => setDeleting(tag)}
                >
                  <Trash2 size={20} />
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
