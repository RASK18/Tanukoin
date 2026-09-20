import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  X,
  Leaf,
  House,
  ShoppingBasket,
  TrainFront,
  Utensils,
  Gamepad2,
  HeartPulse,
  ShoppingBag,
  Wallet,
  Ellipsis,
  Folder,
} from "lucide-react";
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
const icons = {
  House,
  ShoppingBasket,
  TrainFront,
  Utensils,
  Gamepad2,
  HeartPulse,
  ShoppingBag,
  Wallet,
  Ellipsis,
  Folder,
};
export const CategoryIcon = ({
  name,
  size = 18,
}: {
  name?: string;
  size?: number;
}) => {
  const Icon = icons[name as keyof typeof icons] || Folder;
  return <Icon size={size} />;
};
export function CategoryBadge({
  id,
  categories,
}: {
  id?: string;
  categories: Category[];
}) {
  const category = categories.find((c) => c.id === id);
  const parent = categories.find((c) => c.id === category?.parentId);
  return (
    <span
      className="category-badge"
      style={{
        color: category?.color || "#7b827d",
        backgroundColor: `${category?.color || "#7b827d"}16`,
      }}
    >
      {category ? (
        <>
          <CategoryIcon name={category.icon} size={12} />
          {parent ? `${parent.name} · ` : ""}
          {category.name}
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
export function CategorySelect({
  value,
  onChange,
  categories,
  required = false,
}: {
  value: string;
  onChange: (id: string) => void;
  categories: Category[];
  required?: boolean;
}) {
  return (
    <select
      aria-label="Categoría"
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Sin categorizar</option>
      {categories
        .filter((c) => !c.parentId)
        .map((c) => (
          <optgroup key={c.id} label={c.name}>
            <option value={c.id}>{c.name}</option>
            {categories
              .filter((child) => child.parentId === c.id)
              .map((child) => (
                <option key={child.id} value={child.id}>
                  {c.name} · {child.name}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
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
