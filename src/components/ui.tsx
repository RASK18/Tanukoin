import { categoryEmoji } from "../lib/category-emoji";
import { categoryTree } from "../lib/classification";
export { CategorySelect } from "./Classification";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X, Leaf } from "lucide-react";
import type { Snapshot, Category } from "../data/types";
import { emptySnapshot } from "../data/types";
export const AppContext = createContext({
  data: emptySnapshot(),
  run: async (_task: Promise<unknown>, _message?: string): Promise<boolean> =>
    false,
  notify: (_message: string) => {},
  setBusy: (_busy: boolean) => {},
  setDirty: (_dirty: boolean) => {},
  online: true,
});
export const useApp = () => useContext(AppContext);
export const CategoryIcon = ({
  name,
  size = 18,
}: {
  name?: string;
  size?: number;
}) => (
  <span
    aria-hidden="true"
    className="category-emoji"
    style={{ fontSize: size, lineHeight: 1 }}
  >
    {categoryEmoji(name)}
  </span>
);
export function CategoryBadge({
  id,
  categories,
}: {
  id?: string;
  categories: Category[];
}) {
  const category = categories.find((c) => c.id === id);
  const path = categoryTree(categories).path(id);
  return (
    <span
      className="category-badge"
      tabIndex={category ? 0 : undefined}
      aria-label={path || "Sin categorizar"}
      style={{
        color: category?.color || "#7b827d",
        backgroundColor: `${category?.color || "#7b827d"}16`,
      }}
    >
      {category ? (
        <>
          <CategoryIcon name={category.icon} size={12} />

          {category.name}
          <span className="category-full-path" aria-hidden="true">
            {path}
          </span>
        </>
      ) : (
        "Sin categorizar"
      )}
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Leaf size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { setBusy } = useApp();
  useEffect(() => {
    dialog.current?.showModal();
    setBusy(true);
    return () => setBusy(false);
  }, [setBusy]);
  return (
    <dialog
      ref={dialog}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function AccountSelect({
  value,
  onChange,
  data,
  all = false,
}: {
  value: string;
  onChange: (id: string) => void;
  data: Snapshot;
  all?: boolean;
}) {
  return (
    <select
      aria-label="Cuenta"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={!all}
    >
      <option value="">
        {all ? "Todas las cuentas" : "Selecciona una cuenta"}
      </option>
      {data.accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.currency}
        </option>
      ))}
    </select>
  );
}
