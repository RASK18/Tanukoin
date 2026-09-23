import { useRef, useState } from "react";
import { db } from "../data/db";
import type { Account } from "../data/types";
import { currencyDigits, parseAmount } from "../lib/finance";
import { Field, Modal, useApp } from "./ui";

export function AccountDialog({
  account,
  currency = "EUR",
  onClose,
  onSaved,
}: {
  account?: Account;
  currency?: string;
  onClose: () => void;
  onSaved: (account: Account) => void;
}) {
  const { data, run, notify, setDirty } = useApp();
  const [editing, setEditing] = useState<Account>(() =>
    account
      ? { ...account }
      : { id: crypto.randomUUID(), name: "", bank: "", currency },
  );
  const [opening, setOpening] = useState(
    account?.openingBalance === undefined
      ? ""
      : (account.openingBalance / 10 ** currencyDigits(account.currency))
          .toString()
          .replace(".", ","),
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const close = () => {
    if (!savingRef.current) {
      setDirty(false);
      onClose();
    }
  };
  return (
    <Modal title={account ? "Editar cuenta" : "Nueva cuenta"} onClose={close}>
      <form
        data-editor
        onSubmit={async (e) => {
          e.preventDefault();
          if (savingRef.current) return;
          savingRef.current = true;
          setSaving(true);
          try {
            if (!editing.name.trim())
              throw new Error("Escribe un nombre para la cuenta.");
            const next = {
              ...editing,
              name: editing.name.trim(),
              bank: editing.bank.trim(),
              openingBalance: opening.trim()
                ? parseAmount(opening, ",", editing.currency)
                : undefined,
            };
            if (await run(db.accounts.put(next), "Cuenta guardada"))
              onSaved(next);
          } catch (error) {
            notify(
              error instanceof Error
                ? error.message
                : "No se pudo guardar la cuenta.",
            );
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        <fieldset disabled={saving} className="account-fields">
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
                aria-label="Moneda"
                disabled={data.movements.some(
                  (m) => m.accountId === editing.id,
                )}
                value={editing.currency}
                onChange={(e) =>
                  setEditing({ ...editing, currency: e.target.value })
                }
              >
                {[
                  ...new Set([
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
                    editing.currency,
                  ]),
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
            <button type="button" className="button secondary" onClick={close}>
              Cancelar
            </button>
            <button className="button primary">
              {saving ? "Guardando…" : "Guardar cuenta"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
