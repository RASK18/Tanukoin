import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  WalletCards,
  Tags,
  Workflow,
  CalendarDays,
  Check,
  Link2,
  ArrowRight,
} from "lucide-react";
import { db } from "../data/db";
import type {
  Account,
  Category,
  Rule,
  Recurrence,
  Movement,
} from "../data/types";
import {
  useApp,
  PageTitle,
  Empty,
  Field,
  Modal,
  CategorySelect,
  CategoryIcon,
  AccountSelect,
} from "../components/ui";
import {
  money,
  parseAmount,
  currencyDigits,
  applyRules,
  localDate,
  occurrences,
  nextOccurrence,
  suggestRecurrences,
  displayDate,
} from "../lib/finance";
const id = () => crypto.randomUUID();

export function Accounts() {
  const { data, run, notify, setDirty } = useApp();
  const [editing, setEditing] = useState<Account>();
  const [opening, setOpening] = useState("");
  function edit(a?: Account) {
    const row = a || { id: id(), name: "", bank: "", currency: "EUR" };
    setEditing({ ...row });
    setOpening(
      row.openingBalance === undefined
        ? ""
        : (row.openingBalance / 10 ** currencyDigits(row.currency))
            .toString()
            .replace(".", ","),
    );
  }
  return (
    <>
      <PageTitle
        title="Tus cuentas"
        description="Una vista conjunta, sin perder de vista de dónde viene cada movimiento."
        action={
          <button className="button primary" onClick={() => edit()}>
            <Plus size={16} /> Nueva cuenta
          </button>
        }
      />
      <div className="account-grid">
        {data.accounts.map((a) => {
          const balance = data.movements
            .filter((m) => m.accountId === a.id)
            .reduce((s, m) => s + m.amount, a.openingBalance || 0);
          return (
            <section className="card account-card" key={a.id}>
              <div className="card-heading">
                <span className="feature-icon sage">
                  <WalletCards />
                </span>
                <div className="button-row">
                  <button
                    className="icon-button"
                    aria-label={`Editar ${a.name}`}
                    onClick={() => edit(a)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Eliminar ${a.name}`}
                    onClick={() => {
                      if (
                        data.movements.some((m) => m.accountId === a.id) ||
                        data.recurrences.some((r) => r.accountId === a.id) ||
                        data.rules.some((r) => r.accountId === a.id)
                      ) {
                        notify(
                          "Quita primero los movimientos, reglas y recurrencias de esta cuenta.",
                        );
                        return;
                      }
                      if (confirm(`¿Eliminar ${a.name}?`))
                        void run(db.accounts.delete(a.id), "Cuenta eliminada");
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h2>{a.name}</h2>
              <p>
                {a.bank || "Cuenta local"} · {a.currency}
              </p>
              <strong className="account-balance">
                {money(balance, a.currency)}
              </strong>
              <small>
                {a.openingBalance === undefined
                  ? "Suma de movimientos importados"
                  : "Saldo calculado desde el saldo inicial"}
              </small>
              {a.bankBalance !== undefined && (
                <p className="muted">
                  Informado por el banco: {money(a.bankBalance, a.currency)}{" "}
                  {a.bankBalanceAt && `· ${displayDate(a.bankBalanceAt)}`}
                </p>
              )}
              <div className="account-footer">
                {data.movements.filter((m) => m.accountId === a.id).length}{" "}
                movimientos{" "}
                <span>
                  Datos locales <Check size={12} />
                </span>
              </div>
            </section>
          );
        })}
      </div>
      {!data.accounts.length && (
        <section className="card">
          <Empty
            title="Dale un hogar a tus movimientos"
            action={
              <button className="button primary" onClick={() => edit()}>
                Crear mi primera cuenta
              </button>
            }
          >
            Ponle nombre a tu cuenta. No necesitas introducir tu IBAN.
          </Empty>
        </section>
      )}
      {editing && (
        <Modal
          title={
            data.accounts.some((a) => a.id === editing.id)
              ? "Editar cuenta"
              : "Nueva cuenta"
          }
          onClose={() => {
            setDirty(false);
            setEditing(undefined);
          }}
        >
          <form
            data-editor
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const next = {
                  ...editing,
                  currency: editing.currency.toUpperCase(),
                  openingBalance: opening.trim()
                    ? parseAmount(opening, ",", editing.currency)
                    : undefined,
                };
                if (await run(db.accounts.put(next), "Cuenta guardada"))
                  setEditing(undefined);
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="Mi cuenta principal"
                />
              </Field>
              <Field label="Banco">
                <input
                  value={editing.bank}
                  onChange={(e) =>
                    setEditing({ ...editing, bank: e.target.value })
                  }
                  placeholder="Opcional"
                />
              </Field>
              <Field label="Moneda">
                <select
                  disabled={data.movements.some(
                    (m) => m.accountId === editing.id,
                  )}
                  value={editing.currency}
                  onChange={(e) =>
                    setEditing({ ...editing, currency: e.target.value })
                  }
                >
                  {[
                    "EUR",
                    "USD",
                    "GBP",
                    "CHF",
                    "JPY",
                    "CAD",
                    "MXN",
                    "ARS",
                    "COP",
                    "CLP",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Saldo antes del primer movimiento"
                hint="Opcional. Si no lo conoces, lo dejamos sin indicar."
              >
                <input
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="0,00"
                />
              </Field>
            </div>
            <div className="modal-actions">
              <button className="button primary">Guardar cuenta</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Categories() {
  const { data, run, notify, setDirty } = useApp();
  const [editing, setEditing] = useState<Category>();
  function edit(c?: Category) {
    setEditing(
      c
        ? { ...c }
        : {
            id: id(),
            name: "",
            color: "#6f9c7f",
            icon: "Folder",
            description: "",
          },
    );
  }
  async function remove(c: Category) {
    if (
      data.categories.some((x) => x.parentId === c.id) ||
      data.movements.some((m) => m.categoryId === c.id) ||
      data.rules.some((r) => r.categoryId === c.id)
    ) {
      notify("Reasigna antes sus movimientos, reglas o subcategorías.");
      return;
    }
    if (confirm(`¿Eliminar la categoría ${c.name}?`))
      await run(db.categories.delete(c.id), "Categoría eliminada");
  }
  return (
    <>
      <PageTitle
        title="Cada cosa en su lugar"
        description="Categorías y subcategorías que hablan tu idioma."
        action={
          <button className="button primary" onClick={() => edit()}>
            <Plus size={16} /> Nueva categoría
          </button>
        }
      />
      <div className="category-grid">
        {data.categories
          .filter((c) => !c.parentId)
          .map((c) => (
            <section className="card category-card" key={c.id}>
              <div className="card-heading">
                <span className="category-heading">
                  <span
                    className="feature-icon"
                    style={{ background: `${c.color}18`, color: c.color }}
                  >
                    <CategoryIcon name={c.icon} size={24} />
                  </span>
                  <h2>{c.name}</h2>
                </span>
                <div className="button-row">
                  <button
                    className="icon-button"
                    aria-label={`Editar ${c.name}`}
                    onClick={() => edit(c)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Eliminar ${c.name}`}
                    onClick={() => remove(c)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <p>{c.description}</p>
              <div className="subcategory-list">
                {data.categories
                  .filter((child) => child.parentId === c.id)
                  .map((child) => (
                    <div key={child.id}>
                      <span>{child.name}</span>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${child.name}`}
                        onClick={() => edit(child)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Eliminar ${child.name}`}
                        onClick={() => remove(child)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                <button
                  className="text-link"
                  onClick={() =>
                    setEditing({
                      id: id(),
                      name: "",
                      parentId: c.id,
                      color: c.color,
                      icon: c.icon,
                      description: "",
                    })
                  }
                >
                  <Plus size={13} /> Añadir subcategoría
                </button>
              </div>
            </section>
          ))}
      </div>
      {editing && (
        <Modal
          title="Editar categoría"
          onClose={() => {
            setDirty(false);
            setEditing(undefined);
          }}
        >
          <form
            data-editor
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(db.categories.put(editing), "Categoría guardada"))
                setEditing(undefined);
            }}
          >
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Categoría padre">
                <select
                  disabled={data.categories.some(
                    (c) => c.parentId === editing.id,
                  )}
                  value={editing.parentId || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      parentId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Categoría principal</option>
                  {data.categories
                    .filter((c) => !c.parentId && c.id !== editing.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  value={editing.color}
                  onChange={(e) =>
                    setEditing({ ...editing, color: e.target.value })
                  }
                />
              </Field>
              <Field label="Icono">
                <select
                  value={editing.icon}
                  onChange={(e) =>
                    setEditing({ ...editing, icon: e.target.value })
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
              hint="Por ejemplo: panadería, supermercado y compra semanal."
            >
              <textarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <button className="button primary">Guardar categoría</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Rules() {
  const { data, run, notify, setDirty } = useApp();
  const [editing, setEditing] = useState<Rule>();
  const [min, setMin] = useState(""),
    [max, setMax] = useState(""),
    [preview, setPreview] = useState<Movement[] | null>(null);
  function edit(r?: Rule) {
    setEditing(
      r
        ? { ...r }
        : {
            id: id(),
            name: "",
            enabled: true,
            priority: data.rules.length + 1,
            descriptionContains: "",
            merchantContains: "",
            note: "",
          },
    );
    setMin(
      r?.minAmount === undefined
        ? ""
        : String(
            r.minAmount /
              10 **
                currencyDigits(
                  data.accounts.find((a) => a.id === r.accountId)?.currency ||
                    "EUR",
                ),
          ).replace(".", ","),
    );
    setMax(
      r?.maxAmount === undefined
        ? ""
        : String(
            r.maxAmount /
              10 **
                currencyDigits(
                  data.accounts.find((a) => a.id === r.accountId)?.currency ||
                    "EUR",
                ),
          ).replace(".", ","),
    );
  }
  return (
    <>
      <PageTitle
        title="Menos trabajo, más orden"
        description="Define una vez cómo organizar tus movimientos. Las reglas se aplican por prioridad."
        action={
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!data.rules.length}
              onClick={() =>
                setPreview(
                  data.movements
                    .map((m) => applyRules(m, data.rules))
                    .filter((m) => {
                      const old = data.movements.find((x) => x.id === m.id)!;
                      return (
                        old.categoryId !== m.categoryId || old.notes !== m.notes
                      );
                    }),
                )
              }
            >
              Revisar aplicación al historial
            </button>
            <button className="button primary" onClick={() => edit()}>
              <Plus size={16} /> Nueva regla
            </button>
          </div>
        }
      />
      <section className="card">
        {data.rules.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prioridad</th>
                  <th>Regla</th>
                  <th>Condiciones</th>
                  <th>Activa</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {[...data.rules]
                  .sort((a, b) => a.priority - b.priority)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="priority-badge">{r.priority}</span>
                      </td>
                      <td>
                        <strong>{r.name}</strong>
                        <small>
                          {data.categories.find((c) => c.id === r.categoryId)
                            ?.name || "Solo notas"}
                        </small>
                      </td>
                      <td>
                        {[
                          r.descriptionContains &&
                            `Concepto: ${r.descriptionContains}`,
                          r.merchantContains &&
                            `Comercio: ${r.merchantContains}`,
                          r.accountId &&
                            data.accounts.find((a) => a.id === r.accountId)
                              ?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Cualquier movimiento"}
                        {(r.minAmount !== undefined ||
                          r.maxAmount !== undefined) && (
                          <small>
                            Importe:{" "}
                            {r.minAmount === undefined
                              ? "sin mínimo"
                              : money(
                                  r.minAmount,
                                  data.accounts.find(
                                    (a) => a.id === r.accountId,
                                  )?.currency || "EUR",
                                )}{" "}
                            →{" "}
                            {r.maxAmount === undefined
                              ? "sin máximo"
                              : money(
                                  r.maxAmount,
                                  data.accounts.find(
                                    (a) => a.id === r.accountId,
                                  )?.currency || "EUR",
                                )}
                          </small>
                        )}
                      </td>
                      <td>
                        <input
                          aria-label={`Activar ${r.name}`}
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) =>
                            run(
                              db.rules.update(r.id, {
                                enabled: e.target.checked,
                              }),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${r.name}`}
                          onClick={() => edit(r)}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Eliminar ${r.name}`}
                          onClick={() => {
                            if (confirm("¿Eliminar esta regla?"))
                              void run(
                                db.rules.delete(r.id),
                                "Regla eliminada",
                              );
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Deja que las reglas se ocupen">
            Por ejemplo: si el concepto contiene «supermercado», asignar
            Alimentación.
          </Empty>
        )}
      </section>
      <p className="muted">
        Primero se respetan las categorías manuales. Después se aplica la
        primera regla que coincida. La IA actúa al final.
      </p>
      {editing && (
        <Modal
          title="Configurar regla"
          onClose={() => {
            setDirty(false);
            setEditing(undefined);
          }}
        >
          <form
            data-editor
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const currency =
                  data.accounts.find((a) => a.id === editing.accountId)
                    ?.currency || "EUR";
                if ((min || max) && !editing.accountId)
                  throw new Error(
                    "Selecciona una cuenta para que los límites de importe tengan una moneda concreta.",
                  );
                const rule = {
                  ...editing,
                  minAmount: min ? parseAmount(min, ",", currency) : undefined,
                  maxAmount: max ? parseAmount(max, ",", currency) : undefined,
                };
                if (
                  rule.minAmount !== undefined &&
                  rule.maxAmount !== undefined &&
                  rule.minAmount > rule.maxAmount
                )
                  throw new Error("El mínimo no puede superar el máximo.");
                if (!rule.categoryId && !rule.note.trim())
                  throw new Error(
                    "Elige una categoría o una nota como acción.",
                  );
                if (await run(db.rules.put(rule), "Regla guardada"))
                  setEditing(undefined);
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Prioridad (menor primero)">
                <input
                  required
                  type="number"
                  min="1"
                  value={editing.priority}
                  onChange={(e) =>
                    setEditing({ ...editing, priority: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="El concepto contiene">
                <input
                  value={editing.descriptionContains}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      descriptionContains: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="El comercio contiene">
                <input
                  value={editing.merchantContains}
                  onChange={(e) =>
                    setEditing({ ...editing, merchantContains: e.target.value })
                  }
                />
              </Field>
              <Field label="Cuenta">
                <AccountSelect
                  value={editing.accountId || ""}
                  onChange={(accountId) =>
                    setEditing({
                      ...editing,
                      accountId: accountId || undefined,
                    })
                  }
                  data={data}
                  all
                />
              </Field>
              <Field label="Asignar categoría">
                <CategorySelect
                  value={editing.categoryId || ""}
                  onChange={(categoryId) =>
                    setEditing({
                      ...editing,
                      categoryId: categoryId || undefined,
                    })
                  }
                  categories={data.categories}
                />
              </Field>
              <Field label="Importe mínimo con signo">
                <input
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder="Sin límite"
                />
              </Field>
              <Field label="Importe máximo con signo">
                <input
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  placeholder="Sin límite"
                />
              </Field>
            </div>
            <Field label="Asignar nota (opcional)">
              <input
                value={editing.note}
                onChange={(e) =>
                  setEditing({ ...editing, note: e.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <button className="button primary">Guardar regla</button>
            </div>
          </form>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Revisar cambios en el historial"
          onClose={() => setPreview(null)}
        >
          <p>
            {preview.length} movimientos cambiarán. Las categorías manuales se
            conservan.
          </p>
          <ul className="review-list">
            {preview.slice(0, 50).map((m) => (
              <li key={m.id}>
                {m.description}
                <ArrowRight size={13} />
                {data.categories.find((c) => c.id === m.categoryId)?.name ||
                  "Sin categoría"}{" "}
                {m.notes && `· ${m.notes}`}
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={!preview.length}
              onClick={async () => {
                if (
                  await run(
                    db.transaction("rw", db.movements, async () => {
                      for (const row of preview) {
                        const current = await db.movements.get(row.id);
                        if (current)
                          await db.movements.put(
                            applyRules(current, data.rules),
                          );
                      }
                    }),
                    "Reglas aplicadas",
                  )
                )
                  setPreview(null);
              }}
            >
              Confirmar cambios
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Subscriptions() {
  const { data, run, notify, setDirty } = useApp();
  const [month, setMonth] = useState(localDate().slice(0, 7)),
    [editing, setEditing] = useState<Recurrence>(),
    [amount, setAmount] = useState(""),
    [linking, setLinking] = useState<{ r: Recurrence; date: string }>(),
    [movementId, setMovementId] = useState("");
  const first = `${month}-01`,
    last = localDate(
      new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
    );
  const days = Number(last.slice(8));
  const offset = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const planned = data.recurrences.flatMap((r) =>
    occurrences(r, first, last).map((date) => ({ r, date })),
  );
  const done = data.recurrences
    .flatMap((r) =>
      r.movementIds.map((mid) => ({
        r,
        m: data.movements.find((m) => m.id === mid),
      })),
    )
    .filter((x) => x.m?.date.startsWith(month));
  const suggestions = suggestRecurrences(data.movements, data.recurrences);
  function edit(r?: Recurrence) {
    setEditing(
      r
        ? { ...r }
        : {
            id: id(),
            name: "",
            accountId: data.accounts[0]?.id || "",
            amount: 0,
            currency: data.accounts[0]?.currency || "EUR",
            frequency: "monthly",
            anchorDate: localDate(),
            nextDate: localDate(),
            active: true,
            movementIds: [],
          },
    );
    setAmount(
      r
        ? String(Math.abs(r.amount) / 10 ** currencyDigits(r.currency)).replace(
            ".",
            ",",
          )
        : "",
    );
  }
  return (
    <>
      <PageTitle
        title="Nada te pilla por sorpresa"
        description="Tus suscripciones y cargos fijos, con un poco de antelación."
        action={
          <button
            className="button primary"
            disabled={!data.accounts.length}
            onClick={() => edit()}
          >
            <Plus size={16} /> Nuevo cargo fijo
          </button>
        }
      />
      {!data.accounts.length && (
        <div className="notice">Crea una cuenta para añadir cargos fijos.</div>
      )}
      <section className="card calendar-card">
        <div className="card-heading">
          <h2>
            <CalendarDays size={18} /> Calendario de cargos
          </h2>
          <input
            aria-label="Mes del calendario"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="calendar-grid">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
            <span className="weekday" key={day}>
              {day}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <div className="calendar-day outside" key={`blank${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            return (
              <div
                className={`calendar-day ${date === localDate() ? "today" : ""}`}
                key={date}
              >
                <span>{i + 1}</span>
                {planned
                  .filter((p) => p.date === date)
                  .map((p) => (
                    <button
                      className="calendar-event"
                      key={p.r.id}
                      onClick={() => {
                        setLinking(p);
                        setMovementId("");
                      }}
                      title="Asociar cargo realizado"
                    >
                      {p.r.name}
                      <small>
                        {money(p.r.amount, p.r.currency)} · previsto
                      </small>
                    </button>
                  ))}
                {done
                  .filter((p) => p.m?.date === date)
                  .map((p) => (
                    <span key={p.m!.id} className="calendar-event done">
                      <Check size={11} />
                      {p.r.name}
                      <small>
                        {money(p.m!.amount, p.m!.currency)} · realizado
                      </small>
                    </span>
                  ))}
              </div>
            );
          })}
        </div>
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>Tus cargos recurrentes</h2>
          <span className="muted">
            {data.recurrences.filter((r) => r.active).length} activos
          </span>
        </div>
        {data.recurrences.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Importe previsto</th>
                  <th>Frecuencia</th>
                  <th>Próximo cargo</th>
                  <th>Activa</th>
                  <th>Editar</th>
                </tr>
              </thead>
              <tbody>
                {data.recurrences.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <small>
                        {data.accounts.find((a) => a.id === r.accountId)?.name}
                      </small>
                    </td>
                    <td>{money(r.amount, r.currency)}</td>
                    <td>
                      {
                        {
                          monthly: "Mensual",
                          weekly: "Semanal",
                          yearly: "Anual",
                        }[r.frequency]
                      }
                    </td>
                    <td>{displayDate(r.nextDate)}</td>
                    <td>
                      <input
                        aria-label={`Activar ${r.name}`}
                        type="checkbox"
                        checked={r.active}
                        onChange={(e) =>
                          run(
                            db.recurrences.update(r.id, {
                              active: e.target.checked,
                            }),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Editar ${r.name}`}
                        onClick={() => edit(r)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Eliminar ${r.name}`}
                        onClick={() => {
                          if (
                            confirm(
                              "¿Eliminar esta recurrencia? Sus movimientos se conservan.",
                            )
                          )
                            void run(
                              db.recurrences.delete(r.id),
                              "Recurrencia eliminada",
                            );
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Un calendario más tranquilo">
            Añade alquiler, suscripciones o cualquier cargo que se repita.
          </Empty>
        )}
      </section>
      {suggestions.length > 0 && (
        <section className="card">
          <div className="card-heading">
            <h2>Patrones que podrían repetirse</h2>
          </div>
          {suggestions.map((group) => {
            const m = group.at(-1)!;
            return (
              <div className="list-row" key={m.id}>
                <span>
                  {m.merchant || m.description}
                  <small>
                    {group.length} cargos similares · posible recurrencia
                    mensual
                  </small>
                </span>
                <button
                  className="button secondary small"
                  onClick={() => {
                    const r: Recurrence = {
                      id: id(),
                      name: m.merchant || m.description,
                      accountId: m.accountId,
                      amount: m.amount,
                      currency: m.currency,
                      frequency: "monthly",
                      anchorDate: group[0].date,
                      nextDate: "",
                      active: true,
                      movementIds: group.map((x) => x.id),
                    };
                    r.nextDate = nextOccurrence(r, m.date);
                    edit(r);
                  }}
                >
                  Revisar propuesta
                </button>
              </div>
            );
          })}
        </section>
      )}
      {editing && (
        <Modal
          title="Cargo recurrente"
          onClose={() => {
            setDirty(false);
            setEditing(undefined);
          }}
        >
          <form
            data-editor
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const a = data.accounts.find((a) => a.id === editing.accountId);
                if (!a) throw new Error("Selecciona una cuenta");
                const r = {
                  ...editing,
                  currency: a.currency,
                  amount: -Math.abs(parseAmount(amount, ",", a.currency)),
                };
                if (await run(db.recurrences.put(r), "Recurrencia guardada"))
                  setEditing(undefined);
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            <div className="form-grid">
              <Field label="Nombre">
                <input
                  required
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Importe esperado">
                <input
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Cuenta">
                <AccountSelect
                  value={editing.accountId}
                  onChange={(accountId) =>
                    setEditing({ ...editing, accountId })
                  }
                  data={data}
                />
              </Field>
              <Field label="Frecuencia">
                <select
                  value={editing.frequency}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      frequency: e.target.value as Recurrence["frequency"],
                    })
                  }
                >
                  <option value="monthly">Mensual</option>
                  <option value="weekly">Semanal</option>
                  <option value="yearly">Anual</option>
                </select>
              </Field>
              <Field
                label="Fecha de referencia"
                hint="Se conserva el día original al pasar por meses cortos."
              >
                <input
                  required
                  type="date"
                  value={editing.anchorDate}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      anchorDate: e.target.value,
                      nextDate: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Próximo vencimiento desde">
                <input
                  required
                  min={editing.anchorDate}
                  type="date"
                  value={editing.nextDate}
                  onChange={(e) =>
                    setEditing({ ...editing, nextDate: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="modal-actions">
              <button className="button primary">Guardar cargo</button>
            </div>
          </form>
        </Modal>
      )}
      {linking && (
        <Modal
          title={`Asociar cargo: ${linking.r.name}`}
          onClose={() => setLinking(undefined)}
        >
          <p>
            Vencimiento previsto: {displayDate(linking.date)}. Elige el
            movimiento realmente cobrado.
          </p>
          <Field label="Movimiento realizado">
            <select
              value={movementId}
              onChange={(e) => setMovementId(e.target.value)}
            >
              <option value="">Selecciona un movimiento</option>
              {data.movements
                .filter(
                  (m) =>
                    m.accountId === linking.r.accountId &&
                    m.amount < 0 &&
                    !data.recurrences.some((r) => r.movementIds.includes(m.id)),
                )
                .sort(
                  (a, b) =>
                    Math.abs(Date.parse(a.date) - Date.parse(linking.date)) -
                    Math.abs(Date.parse(b.date) - Date.parse(linking.date)),
                )
                .slice(0, 100)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.date} · {m.description} · {money(m.amount, m.currency)}
                  </option>
                ))}
            </select>
          </Field>
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={!movementId}
              onClick={async () => {
                if (
                  await run(
                    db.recurrences.update(linking.r.id, {
                      movementIds: [...linking.r.movementIds, movementId],
                      nextDate: nextOccurrence(linking.r, linking.date),
                    }),
                    "Cargo asociado",
                  )
                )
                  setLinking(undefined);
              }}
            >
              <Link2 size={15} /> Asociar y avanzar fecha
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
