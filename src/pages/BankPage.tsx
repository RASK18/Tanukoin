import { useRef, useState, useEffect } from "react";

import { Link } from "react-router-dom";
import {
  Landmark,
  ShieldCheck,
  Download,
  ExternalLink,
  Check,
  Link2,
  X,
} from "lucide-react";
import { useApp, PageTitle, Field } from "../components/ui";
import { db } from "../data/db";
import type { Account, Movement } from "../data/types";
import { localDate, parseAmount } from "../lib/finance";
import {
  authorize,
  bankRequest,
  loadCredentials,
  getSession,
  revoke,
  clearCredentials,
  transactions,
  type Bank,
  type BankSession,
} from "../features/banking/client";
import { ImportDialog } from "../features/import/ImportDialog";
export function BankPage() {
  const { data, run, notify, online, setBusy } = useApp();
  const [appId, setAppId] = useState(""),
    [loaded, setLoaded] = useState(false),
    [banks, setBanks] = useState<Bank[]>([]),
    [country, setCountry] = useState("ES"),
    [bankIndex, setBankIndex] = useState(""),
    [session, setSession] = useState<BankSession | null>(getSession()),
    [selected, setSelected] = useState(""),
    [target, setTarget] = useState(""),
    [from, setFrom] = useState(
      localDate(
        new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1),
      ),
    ),
    [to, setTo] = useState(localDate()),
    [busy, setWorking] = useState(false),
    [preview, setPreview] = useState<Movement[]>();
  const abort = useRef<AbortController | null>(null);

  const authorization = useRef<AbortController | null>(null);

  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => () => authorization.current?.abort(), []);

  async function work(action: () => Promise<void>) {
    setWorking(true);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Tu banco, conectado contigo"
        description="Una conexión personal, con tus propias credenciales y sin servidor intermediario."
      />
      <div className="notice">
        <ShieldCheck size={19} />
        <span>
          Tu PEM nunca sale del navegador. Los tokens firmados y las consultas
          sí se envían a Enable Banking para acceder a tus cuentas.
        </span>
      </div>

      {authorizing && (
        <div className="notice" role="status">
          Autorización pendiente (máximo 10 minutos).
          <button
            className="button secondary"
            onClick={() => authorization.current?.abort()}
          >
            Cancelar autorización
          </button>
        </div>
      )}

      <div className="bank-grid">
        <section className="card">
          <div className="card-heading">
            <h2>Guía de conexión</h2>
            <Landmark size={20} />
          </div>
          <ol className="tutorial">
            <li>
              <strong>Crea tu cuenta personal</strong>
              <p>
                Accede al{" "}
                <a
                  href="https://enablebanking.com/sign-in/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  panel de Enable Banking
                </a>
                . Cada persona utiliza su propia aplicación.
              </p>
            </li>
            <li>
              <strong>Registra una aplicación</strong>
              <p>
                En API applications elige Sandbox para pruebas o Production para
                tus cuentas. Genera la clave en el navegador y guarda el archivo
                .pem. El nombre del archivo contiene tu Application ID.
              </p>
            </li>
            <li>
              <strong>Configura el retorno</strong>
              <p>Añade esta URL exacta a Allowed redirect URLs:</p>
              <code className="copy-value">
                {location.origin}
                {import.meta.env.BASE_URL}bank-callback.html
              </code>
              <p>
                En producción, completa los datos, contacto y enlaces de
                privacidad y condiciones que solicite el panel. Activa el modo
                restringido vinculando cada cuenta propia que quieras consultar.
              </p>
            </li>
            <li>
              <strong>Instala el conector local</strong>
              <p>
                Descarga el ZIP, descomprímelo y abre chrome://extensions o
                edge://extensions. Activa Modo desarrollador y elige Cargar
                descomprimida. Selecciona la carpeta de la extensión y recarga
                Tanukoin.
              </p>
              <a
                className="button secondary small"
                href={`${import.meta.env.BASE_URL}extension/tanukoin-extension.zip`}
                download
              >
                <Download size={14} /> Descargar extensión
              </a>
              <p>
                Disponible en Chrome y Edge de escritorio. La extensión solo
                tiene permiso para Enable Banking y esta instalación de
                Tanukoin. Para actualizarla, sustituye sus archivos y pulsa
                Recargar en la página de extensiones.
              </p>
            </li>
            <li>
              <strong>Carga y autoriza</strong>
              <p>
                Introduce tu Application ID, selecciona tu PEM, elige el banco y
                completa la autorización en su ventana. Las credenciales se
                olvidan al cerrar o recargar la app.
              </p>
            </li>
          </ol>
          <p className="muted">
            <a
              href="https://enablebanking.com/terms/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Condiciones de uso personal
            </a>{" "}
            ·{" "}
            <a
              href="https://enablebanking.com/docs/api/control-panel/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentación oficial
            </a>
          </p>
        </section>
        <section className="card bank-connect">
          <div className="card-heading">
            <h2>Conectar mis cuentas</h2>
          </div>
          {!data.settings[0]?.banking && (
            <div className="notice warning">
              La conexión está desactivada.{" "}
              <Link to="/ajustes">Activarla en Ajustes</Link>
            </div>
          )}
          <fieldset disabled={!data.settings[0]?.banking || busy || !online}>
            <Field label="Application ID">
              <input
                autoComplete="off"
                value={appId}
                onChange={(e) => {
                  setAppId(e.target.value);
                  setLoaded(false);
                  clearCredentials();
                }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </Field>
            <Field label="Clave privada (.pem)">
              <input
                type="file"
                accept=".pem,.key"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    if (file.size > 30000)
                      throw new Error("El archivo PEM es demasiado grande.");
                    await loadCredentials(appId.trim(), await file.text());
                    setLoaded(true);
                    notify(
                      "Clave cargada en memoria. No se ha guardado ni enviado.",
                    );
                  } catch (e) {
                    notify(String(e));
                  }
                }}
              />
            </Field>
            <div className="form-grid">
              <Field label="País">
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {[
                    ["ES", "España"],
                    ["FR", "Francia"],
                    ["DE", "Alemania"],
                    ["IT", "Italia"],
                    ["PT", "Portugal"],
                    ["FI", "Finlandia"],
                    ["NL", "Países Bajos"],
                    ["BE", "Bélgica"],
                    ["GB", "Reino Unido"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button secondary"
                disabled={!loaded}
                onClick={() =>
                  work(async () => {
                    await bankRequest("ping");
                    await bankRequest("application");
                    const result = await bankRequest<{ aspsps: Bank[] }>(
                      "banks",
                      { country },
                    );
                    setBanks(result.aspsps);
                    notify("Extensión y credenciales comprobadas.");
                  })
                }
              >
                Comprobar y listar bancos
              </button>
            </div>
            {banks.length > 0 && (
              <>
                <Field label="Banco">
                  <select
                    value={bankIndex}
                    onChange={(e) => setBankIndex(e.target.value)}
                  >
                    <option value="">Selecciona tu banco</option>
                    {banks.map((b, i) => (
                      <option key={`${b.name}-${i}`} value={i}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  className="button primary"
                  disabled={bankIndex === ""}
                  onClick={() =>
                    work(async () => {
                      authorization.current = new AbortController();

                      setAuthorizing(true);

                      let s: BankSession;

                      try {
                        s = await authorize(
                          banks[Number(bankIndex)],
                          authorization.current.signal,
                        );
                      } finally {
                        setAuthorizing(false);
                        authorization.current = null;
                      }

                      setSession(s);
                      setSelected(s.accounts[0]?.uid || "");
                      if (!s.accounts.length)
                        notify(
                          "No se han devuelto cuentas. Revisa que estén vinculadas en el panel de Enable Banking.",
                        );
                    })
                  }
                >
                  <Link2 size={16} /> Autorizar en el banco
                </button>
              </>
            )}
            {session && (
              <div className="connected-accounts">
                <div className="notice">
                  <Check size={15} /> Sesión autorizada. Caduca:{" "}
                  {new Date(session.access.valid_until).toLocaleDateString(
                    "es-ES",
                  )}
                </div>
                <Field label="Cuenta bancaria">
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Selecciona una cuenta</option>
                    {session.accounts.map((a) => (
                      <option key={a.uid} value={a.uid}>
                        {a.name || "Cuenta"} · {a.currency} · …
                        {a.account_id?.iban?.slice(-4) || a.uid.slice(-4)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Guardar en">
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">
                      Crear / reutilizar cuenta conectada
                    </option>
                    {data.accounts
                      .filter(
                        (a) =>
                          a.currency ===
                          session.accounts.find((s) => s.uid === selected)
                            ?.currency,
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Desde">
                    <input
                      type="date"
                      value={from}
                      max={to}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </Field>
                  <Field label="Hasta">
                    <input
                      type="date"
                      value={to}
                      min={from}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </Field>
                </div>
                <button
                  className="button primary"
                  disabled={!selected || !from || !to || from > to}
                  onClick={() =>
                    work(async () => {
                      await bankRequest("sessionStatus", {
                        id: session.session_id,
                      });
                      const remote = session.accounts.find(
                        (a) => a.uid === selected,
                      )!;
                      const stable =
                        remote.identification_hash ||
                        remote.account_id?.iban ||
                        remote.uid;
                      let account =
                        data.accounts.find((a) => a.id === target) ||
                        data.accounts.find((a) => a.externalId === stable);
                      const isNew = !account;
                      if (!account)
                        account = {
                          id: crypto.randomUUID(),
                          name:
                            remote.name ||
                            `${session.aspsp.name} · ${remote.currency}`,
                          bank: session.aspsp.name,
                          currency: remote.currency,
                          externalId: stable,
                        };
                      abort.current = new AbortController();
                      const movements = await transactions(
                        remote.uid,
                        from,
                        to,
                        account,
                        abort.current.signal,
                      );
                      if (abort.current.signal.aborted)
                        throw new Error("Consulta cancelada.");
                      try {
                        const response = await bankRequest<{
                          balances: {
                            balance_amount: {
                              amount: string;
                              currency: string;
                            };
                            balance_type?: string;
                          }[];
                        }>("balances", { id: remote.uid });
                        const balance =
                          response.balances.find(
                            (b) => b.balance_type === "CLBD",
                          ) || response.balances[0];
                        if (
                          balance?.balance_amount.currency === account.currency
                        )
                          account = {
                            ...account,
                            bankBalance: parseAmount(
                              balance.balance_amount.amount,
                              ".",
                              account.currency,
                            ),
                            bankBalanceAt: localDate(),
                          };
                      } catch {
                        /* transactions can still be imported if balances unavailable */
                      }
                      await db.accounts.put(account);
                      setPreview(movements);
                      if (!movements.length)
                        notify(
                          "No hay movimientos contabilizados en ese período.",
                        );
                    })
                  }
                >
                  Consultar y revisar movimientos
                </button>
                <button
                  className="text-button danger"
                  onClick={() =>
                    work(async () => {
                      await revoke();
                      setSession(null);
                      setLoaded(false);
                      setBanks([]);
                      notify("Sesión revocada y credenciales olvidadas.");
                    })
                  }
                >
                  Revocar sesión
                </button>
              </div>
            )}
          </fieldset>
          {busy && (
            <div className="notice">
              Conectando con Enable Banking…
              {abort.current && (
                <button
                  className="text-button"
                  onClick={() => abort.current?.abort()}
                >
                  Cancelar consulta
                </button>
              )}
            </div>
          )}
          <p className="muted">
            Las contraseñas de tu banco se introducen únicamente en la página
            del banco. Tanukoin no solicita ni guarda esas contraseñas.
          </p>
        </section>
      </div>
      {preview && (
        <ImportDialog initial={preview} onClose={() => setPreview(undefined)} />
      )}
    </>
  );
}
