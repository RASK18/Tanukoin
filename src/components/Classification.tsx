import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { Category, Tag } from "../data/types";
import { categoryTree, type TagMode } from "../lib/classification";
import { normalize } from "../lib/finance";
import "./classification.css";

type Option = { id: string; label: string };
function SearchPicker({
  label,
  display = "",
  options,
  onSelect,
  onCreate,
  required = false,
  multiple = false,
}: {
  label: string;
  display?: string;
  options: Option[];
  onSelect: (id: string) => void;
  onCreate?: (name: string) => void;
  required?: boolean;
  multiple?: boolean;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const found = options.filter((o) =>
    normalize(o.label).includes(normalize(query)),
  );
  const canCreate =
    !!onCreate &&
    !!query.trim() &&
    !options.some((o) => normalize(o.label) === normalize(query));
  const choices = canCreate
    ? [...found, { id: "__create__", label: `Crear «${query.trim()}»` }]
    : found;
  const cursor = Math.min(active, Math.max(0, choices.length - 1));
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${cursor}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, cursor, query, id]);
  function choose(option: Option) {
    if (option.id === "__create__") onCreate?.(query.trim());
    else onSelect(option.id);
    setQuery("");
    setActive(0);
    setOpen(multiple);
    input.current?.focus();
  }
  return (
    <div
      className="classification-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="picker-input">
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && choices.length ? `${id}-${cursor}` : undefined
          }
          value={open ? query : display}
          placeholder={
            multiple
              ? onCreate
                ? "Buscar o añadir etiquetas…"
                : "Buscar etiquetas…"
              : "Buscar categoría…"
          }
          required={required && !display}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setQuery("");
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive(
                Math.max(
                  0,
                  Math.min(
                    choices.length - 1,
                    cursor + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && open) {
              e.preventDefault();
              if (choices[cursor]) choose(choices[cursor]);
            }
          }}
        />
        <ChevronDown size={16} aria-hidden="true" />
      </div>
      {open && (
        <ul
          className="picker-options"
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
        >
          {choices.map((option, i) => (
            <li
              key={option.id}
              role="option"
              id={`${id}-${i}`}
              aria-selected={i === cursor}
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(option)}
            >
              {option.label}
            </li>
          ))}
          {!choices.length && (
            <li role="presentation" className="muted">
              Sin coincidencias
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function CategorySelect({
  value,
  onChange,
  categories,
  required = false,
  label = "Categoría",
  emptyLabel = "Sin categorizar",
  filter = false,
  excluded = [],
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  required?: boolean;
  label?: string;
  emptyLabel?: string;
  filter?: boolean;
  excluded?: string[];
}) {
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const options = [
    { id: "", label: emptyLabel },
    ...(filter ? [{ id: "uncategorized", label: "Sin categorizar" }] : []),
    ...tree.options
      .filter((o) => !excluded.includes(o.category.id))
      .map((o) => ({ id: o.category.id, label: o.path })),
  ];
  return (
    <SearchPicker
      label={label}
      display={
        options.find((o) => o.id === value)?.label || "Categoría eliminada"
      }
      options={options}
      onSelect={onChange}
      required={required}
    />
  );
}

export function TagPicker({
  value,
  onChange,
  tags,
  onCreate,
  label = "Buscar etiquetas",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  tags: Tag[];
  onCreate?: (name: string) => void;
  label?: string;
}) {
  const options = [...tags]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((t) => ({ id: t.id, label: t.name }));
  return (
    <div className="tag-picker">
      {value.length > 0 && (
        <div className="tag-chips">
          {value.map((id) => (
            <span className="tag-chip" key={id}>
              {tags.find((t) => t.id === id)?.name || "Etiqueta eliminada"}
              <button
                type="button"
                aria-label={`Quitar ${tags.find((t) => t.id === id)?.name || "etiqueta eliminada"}`}
                onClick={() => onChange(value.filter((t) => t !== id))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <SearchPicker
        label={label}
        options={options}
        onSelect={(id) => onChange([...new Set([...value, id])])}
        onCreate={onCreate}
        multiple
      />
    </div>
  );
}

export function TagFilter({
  value,
  mode,
  onChange,
  onModeChange,
  tags,
}: {
  value: string[];
  mode: TagMode;
  onChange: (ids: string[]) => void;
  onModeChange: (mode: TagMode) => void;
  tags: Tag[];
}) {
  return (
    <div className="tag-filter">
      <select
        aria-label="Coincidencia de etiquetas"
        value={mode}
        onChange={(e) => onModeChange(e.target.value as TagMode)}
      >
        <option value="all">Todas las etiquetas seleccionadas</option>
        <option value="any">Cualquiera de las seleccionadas</option>
        <option value="none">Sin etiquetas</option>
      </select>
      {mode !== "none" && (
        <TagPicker
          label="Filtrar etiquetas"
          tags={tags}
          value={value}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export function TagChips({ ids, tags }: { ids: string[]; tags: Tag[] }) {
  return (
    <span className="tag-chips">
      {(ids || []).map((id) => {
        const tag = tags.find((t) => t.id === id);
        return tag ? (
          <span className="tag-chip" key={id}>
            {tag.name}
          </span>
        ) : null;
      })}
    </span>
  );
}
