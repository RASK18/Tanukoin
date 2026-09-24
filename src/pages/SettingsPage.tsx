import { useEffect, useState } from "react";
import {
  Download,
  Upload,
  ShieldCheck,
  HardDrive,
  Map,
  Search,
  Landmark,
  Trash2,
} from "lucide-react";
import { db } from "../data/db";
import { useApp, PageTitle, Field, Modal } from "../components/ui";
import {
  exportBackup,
  restoreBackup,
  validateBackup,
  download,
} from "../lib/backup";
import { localDate } from "../lib/finance";
import { clearCredentials } from "../features/banking/client";
import type { Snapshot } from "../data/types";
export function SettingsPage() {
  const { data, run, notify } = useApp();
  const settings = data.settings[0];
  const [storage, setStorage] = useState<{
      usage?: number;
      quota?: number;
      persistent?: boolean;
    }>({}),
    [backup, setBackup] = useState<{ raw: unknown; data: Snapshot }>(),
    [timezone, setTimezone] = useState(settings?.timezone || "Europe/Madrid");
  async function refresh() {
    if (navigator.storage) {
      const estimate = await navigator.storage.estimate();
      setStorage({
        ...estimate,
        persistent: await navigator.storage.persisted(),
      });
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const mb = (n?: number) =>
    n === undefined ? "No disponible" : `${(n / 1024 / 1024).toFixed(1)} MB`;
  return (
    <>
      <PageTitle
        illustration="tanu-sentado-sonriendo"
        title="Tu espacio, tus decisiones"
        description="Controla qué se guarda y cuándo permites salir a internet."
      />
      <div className="settings-grid">
        <section className="card">
          <div className="card-heading">
            <h2>
              <ShieldCheck size={19} /> Privacidad y conexiones
            </h2>
          </div>
          <p>
            Los datos y la IA se procesan localmente. Cada servicio externo
            recibe únicamente lo necesario para la función que actives.
          </p>
          {(
            [
              {
                key: "maps",
                Icon: Map,
                title: "Callejero del mapa",
                description:
                  "OpenStreetMap recibe las peticiones de la zona visible y tu IP. No recibe los marcadores de tus cargos.",
              },
              {
                key: "search",
                Icon: Search,
                title: "Consultar comercios",
                description:
                  "Photon y Wikipedia reciben el nombre y localidad que revises al buscar. No se envía tu historial.",
              },
              {
                key: "banking",
                Icon: Landmark,
                title: "Conectar Enable Banking",
                description:
                  "Tu extensión comunica solicitudes y tokens firmados al proveedor. La clave privada permanece en memoria.",
              },
            ] as const
          ).map((c) => (
            <label className="setting-row" key={c.key}>
              <c.Icon size={20} />
              <span>
                <strong>{c.title}</strong>
                <small>{c.description}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={settings?.[c.key] || false}
                onChange={(e) => {
                  if (c.key === "banking" && !e.target.checked)
                    clearCredentials();
                  void run(
                    db.settings.update("main", { [c.key]: e.target.checked }),
                    "Preferencia guardada",
                  );
                }}
              />
            </label>
          ))}
          <p className="muted">
            Sin analítica, seguimiento ni sincronización en la nube. Al
            restaurar una copia, estas conexiones vuelven a estar desactivadas.
          </p>
        </section>
        <section className="card">
          <div className="card-heading">
            <h2>
              <HardDrive size={19} /> Almacenamiento local
            </h2>
          </div>
          <div className="storage-stats">
            <strong>{mb(storage.usage)}</strong>
            <small>
              utilizados de {mb(storage.quota)} disponibles para este origen
            </small>
          </div>
          <p>
            Persistencia:{" "}
            <strong>
              {storage.persistent ? "solicitada y concedida" : "no concedida"}
            </strong>
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              const persisted = await navigator.storage?.persist();
              await refresh();
              notify(
                persisted
                  ? "Almacenamiento persistente concedido. Sigue haciendo copias."
                  : "El navegador no ha concedido persistencia. Guarda una copia periódica.",
              );
            }}
          >
            Solicitar almacenamiento persistente
          </button>
          <p className="muted">
            Borrar los datos del navegador elimina tu información. No hay una
            copia en nuestros servidores. El almacenamiento local no añade
            cifrado con contraseña.
          </p>
        </section>
      </div>
      <section className="card">
        <div className="card-heading">
          <h2>Copias de seguridad</h2>
          <ShieldCheck size={19} />
        </div>
        <p>
          Guarda tus movimientos, reglas, categorías, etiquetas y ubicaciones en
          un archivo. No contiene claves PEM, tokens bancarios ni modelos de IA.
          El archivo contiene datos personales sin cifrar: guárdalo en un lugar
          privado.
        </p>
        <div className="button-row">
          <button
            className="button primary"
            onClick={async () => {
              try {
                download(`tanukoin-${localDate()}.json`, await exportBackup());
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            <Download size={16} /> Descargar copia completa
          </button>
          <label className="button secondary">
            <Upload size={16} /> Restaurar copia
            <input
              type="file"
              accept=".json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  if (file.size > 200 * 1024 * 1024)
                    throw new Error("La copia supera 200 MB.");
                  const raw = JSON.parse(await file.text());
                  setBackup({ raw, data: validateBackup(raw) });
                } catch (e) {
                  notify(String(e));
                }
              }}
            />
          </label>
        </div>
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>Preferencias</h2>
        </div>
        <p>
          Puedes recuperar las ayudas de bienvenida que hayas cerrado en el
          resumen. Solo aparecerán si aún no tienes movimientos o el chat local
          preparado.
        </p>
        <button
          className="button secondary"
          disabled={!settings?.hideImportWelcome && !settings?.hideTanuWelcome}
          onClick={() =>
            void run(
              db.settings.update("main", {
                hideImportWelcome: false,
                hideTanuWelcome: false,
              }),
              "Ayudas de bienvenida restablecidas",
            )
          }
        >
          Restablecer ayudas de bienvenida
        </button>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              new Intl.DateTimeFormat("es-ES", { timeZone: timezone });
              void run(
                db.settings.update("main", { timezone }),
                "Zona horaria guardada",
              );
            } catch {
              notify(
                "Zona horaria no válida. Usa un nombre como Europe/Madrid.",
              );
            }
          }}
        >
          <Field label="Zona horaria para el historial de ubicaciones">
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              list="timezones"
            />
            <datalist id="timezones">
              {[
                "Europe/Madrid",
                "Atlantic/Canary",
                "Europe/London",
                "America/Mexico_City",
                "America/Argentina/Buenos_Aires",
                "America/Bogota",
                "UTC",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </datalist>
          </Field>
          <button className="button secondary">Guardar</button>
        </form>
        <p className="muted">
          Interfaz en español · Tanukoin v{__APP_VERSION__} · AGPL-3.0
        </p>
      </section>
      <section className="card">
        <div className="card-heading">
          <h2>Eliminar historial de ubicaciones</h2>
        </div>
        <p>
          Elimina los puntos importados y las asociaciones geográficas. Conserva
          los movimientos bancarios.
        </p>
        <button
          className="button secondary danger"
          onClick={() => {
            if (
              confirm(
                "¿Eliminar todas las ubicaciones y sus asociaciones? Esta acción no se puede deshacer sin una copia.",
              )
            )
              void run(
                db.transaction(
                  "rw",
                  [db.locations, db.assignments],
                  async () => {
                    await db.locations.clear();
                    await db.assignments.clear();
                  },
                ),
                "Ubicaciones eliminadas",
              );
          }}
        >
          <Trash2 size={15} /> Eliminar ubicaciones
        </button>
      </section>
      {backup && (
        <Modal
          title="Restaurar copia de seguridad"
          onClose={() => setBackup(undefined)}
        >
          <p>
            La copia contiene {backup.data.accounts.length} cuentas,{" "}
            {backup.data.movements.length} movimientos,{" "}
            {backup.data.categories.length} categorías,{" "}
            {backup.data.tags.length} etiquetas y {backup.data.locations.length}{" "}
            ubicaciones.
          </p>
          <div className="notice warning">
            Se sustituirán todos los datos locales actuales. Descarga una copia
            antes si quieres conservarlos.
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={async () =>
                download(
                  `tanukoin-antes-de-restaurar-${localDate()}.json`,
                  await exportBackup(),
                )
              }
            >
              Guardar copia actual
            </button>
            <button
              className="button primary"
              onClick={async () => {
                clearCredentials();
                if (await run(restoreBackup(backup.raw), "Copia restaurada")) {
                  setBackup(undefined);
                  await refresh();
                }
              }}
            >
              Sustituir datos y restaurar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
