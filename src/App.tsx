import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowDownUp,
  House,
  WalletCards,
  Tags,
  Workflow,
  CalendarDays,
  MapPinned,
  Sparkles,
  Settings,
  ShieldCheck,
  Search,
  Menu,
  X,
  Download,
  WifiOff,
  Leaf,
} from "lucide-react";
import { db, initialize, readSnapshot } from "./data/db";
import { emptySnapshot } from "./data/types";
import { AppContext } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Movements } from "./pages/Movements";
import { Accounts, Categories, Rules, Subscriptions } from "./pages/Manage";
import { MapPage } from "./pages/MapPage";
import { AIPage } from "./pages/AIPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BankPage } from "./pages/BankPage";
import { ImportDialog } from "./features/import/ImportDialog";
import { Tanu } from "./features/ai/Tanu";
const links = [
  ["/", "Resumen", House],
  ["/movimientos", "Movimientos", ArrowDownUp],
  ["/cuentas", "Cuentas", WalletCards],
  ["/categorias", "Categorías", Tags],
  ["/reglas", "Reglas", Workflow],
  ["/suscripciones", "Suscripciones", CalendarDays],
  ["/mapa", "Mapa", MapPinned],
  ["/ia", "IA local", Sparkles],
  ["/ajustes", "Ajustes", Settings],
] as const;
export function App() {
  const data = useLiveQuery(readSnapshot, []) || emptySnapshot();
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [sidebar, setSidebar] = useState(false),
    [importing, setImporting] = useState(false),
    [search, setSearch] = useState(""),
    [remoteVersion, setRemoteVersion] = useState("");
  const navigate = useNavigate();
  const updateRequested = useRef(false);
  const safeToReload = useRef(true);
  safeToReload.current = !busy && !dirty;
  const notify = useCallback((message: string) => setNotice(message), []);
  const run = useCallback(async (task: Promise<unknown>, message?: string) => {
    try {
      await task;
      if (message) setNotice(message);
      setDirty(false);
      return true;
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Comprueba el espacio disponible.",
      );
      return false;
    }
  }, []);
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Reload only after this tab's explicit request, including first-install tabs.
    onNeedReload: () => {},
    onRegisterError: (e) =>
      setNotice(`No se ha podido preparar el modo offline: ${e.message}`),
  });
  useEffect(() => {
    const changed = () => {
      if (updateRequested.current && safeToReload.current) location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", changed);
    return () =>
      navigator.serviceWorker?.removeEventListener("controllerchange", changed);
  }, []);
  async function applyUpdate() {
    if (!safeToReload.current) return;
    updateRequested.current = true;
    const registration = await navigator.serviceWorker?.getRegistration(
      import.meta.env.BASE_URL,
    );
    if (registration?.waiting) await updateServiceWorker(true);
    else if (safeToReload.current) location.reload();
  }
  useEffect(() => {
    initialize()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 9000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (busy || dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [busy, dirty]);
  useEffect(() => {
    let last = 0;
    const check = async () => {
      if (
        !navigator.onLine ||
        document.visibilityState === "hidden" ||
        Date.now() - last < 15 * 60000
      )
        return;
      last = Date.now();
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const v = (await r.json()).version;
        if (typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v)) {
          const a = v.split(".").map(Number),
            b = __APP_VERSION__.split(".").map(Number);
          if (
            a[0] > b[0] ||
            (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))
          ) {
            setRemoteVersion(v);
            const registration = await navigator.serviceWorker?.getRegistration(
              import.meta.env.BASE_URL,
            );
            await registration?.update();
          }
        }
      } catch {
        /* offline is normal */
      }
    };
    void check();
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  const context = useMemo(
    () => ({ data, run, notify, setBusy, setDirty, online }),
    [data, run, notify, online],
  );
  if (error)
    return (
      <main className="fatal">
        <h1>No se pudo abrir Tanukoin</h1>
        <p>{error}</p>
        <p>
          Comprueba que el navegador permita almacenamiento local. Tus datos
          existentes no se han borrado.
        </p>
        <button onClick={() => location.reload()}>Reintentar</button>
      </main>
    );
  if (!ready)
    return (
      <main className="fatal">
        <img
          src={`${import.meta.env.BASE_URL}tanu.webp`}
          alt="Tanu"
          width="100"
        />
        <h1>Preparando tu espacio…</h1>
      </main>
    );
  return (
    <AppContext.Provider value={context}>
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label="Abrir menú"
          onClick={() => setSidebar(!sidebar)}
        >
          <Menu />
        </button>
        <NavLink to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}tanu.webp`} alt="" />
          <span>
            <strong>
              Tanukoin<span className="brand-dot">.</span>
            </strong>
            <small>Tus finanzas, en tus manos</small>
          </span>
        </NavLink>
        <div className="header-badges">
          <span>
            <ShieldCheck size={13} /> Datos locales
          </span>
          <span>
            <Leaf size={13} /> Sin nube
          </span>
        </div>
        <form
          className="global-search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/movimientos?buscar=${encodeURIComponent(search)}`);
          }}
        >
          <Search size={17} />
          <input
            aria-label="Buscar movimientos"
            placeholder="Buscar entre tus movimientos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <div className="privacy-label">
          <ShieldCheck size={23} />
          <span>
            <strong>Tu espacio privado</strong>
            <small>Solo en este navegador</small>
          </span>
        </div>
      </header>
      {sidebar && (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <span className="nav-label">TU ESPACIO</span>
        <nav>
          {links.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setSidebar(false)}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <Icon size={19} />
              {label}
              {label === "IA local" && <span className="tiny-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="tanu-note">
            <img
              src={`${import.meta.env.BASE_URL}tanu.webp`}
              alt="Tanu, tu compañero de finanzas"
            />
            <p>
              Pequeñas decisiones.
              <br />
              <strong>Grandes libertades.</strong>
            </p>
          </div>
          <div className="version">
            <span className={`status-dot ${online ? "" : "offline"}`} />
            {online
              ? offlineReady
                ? "Disponible sin conexión"
                : "Conectado"
              : "Sin conexión"}
            <small>Tanukoin v{__APP_VERSION__}</small>
          </div>
        </div>
      </aside>
      <main
        className="main"
        onChange={(e) => {
          if ((e.target as HTMLElement).closest("form[data-editor]"))
            setDirty(true);
        }}
      >
        {!online && (
          <div className="notice">
            <WifiOff size={16} /> Estás sin conexión. Tus datos y herramientas
            locales siguen disponibles.
          </div>
        )}
        {(needRefresh || remoteVersion) && (
          <div className="notice update">
            <Download size={17} />
            <span>
              {needRefresh
                ? "Una nueva versión está lista."
                : `Versión ${remoteVersion} disponible. Preparando la actualización…`}{" "}
              {(busy || dirty) &&
                "Termina o guarda los cambios antes de actualizar."}
            </span>
            <button
              disabled={!needRefresh || busy || dirty}
              className="button small"
              onClick={applyUpdate}
            >
              Actualizar ahora
            </button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={<Dashboard onImport={() => setImporting(true)} />}
          />
          <Route
            path="/movimientos"
            element={<Movements onImport={() => setImporting(true)} />}
          />
          <Route path="/cuentas" element={<Accounts />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/reglas" element={<Rules />} />
          <Route path="/suscripciones" element={<Subscriptions />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/ia" element={<AIPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="/banco" element={<BankPage />} />
          <Route
            path="*"
            element={<Dashboard onImport={() => setImporting(true)} />}
          />
        </Routes>
        <footer className="main-footer">
          <span>
            <ShieldCheck size={13} /> Hecho para cuidar de tus datos.
          </span>
          <a
            href="https://github.com/RASK18/Tanukoin"
            target="_blank"
            rel="noopener noreferrer"
          >
            Tanukoin · Código fuente AGPL-3.0
          </a>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      <Tanu />
    </AppContext.Provider>
  );
}
