import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Upload,
  MapPin,
  Check,
  Trash2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { db } from "../data/db";
import type { Location } from "../data/types";
import { useApp, PageTitle, Field, Empty } from "../components/ui";
import { localDate, money } from "../lib/finance";
import { locationCandidates } from "../features/locations/parse";
import { MerchantSearch } from "../features/locations/MerchantSearch";
export function MapPage() {
  const { data, run, notify, online, setBusy } = useApp();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(params.get("id") || ""),
    [previous, setPrevious] = useState(false),
    [staged, setStaged] = useState<Location[] | null>(null),
    [loading, setLoading] = useState(false),
    [skipped, setSkipped] = useState(0),
    [manual, setManual] = useState({ name: "", lat: "", lng: "" }),
    [placeMode, setPlaceMode] = useState(false),
    [searching, setSearching] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    markers = useRef<L.LayerGroup | null>(null),
    tiles = useRef<L.TileLayer | null>(null),
    worker = useRef<Worker | null>(null);
  const mode = useRef(placeMode);
  const rejectImport = useRef<((error: Error) => void) | null>(null);
  mode.current = placeMode;
  const movement = data.movements.find((m) => m.id === selected);
  const candidates = movement
    ? locationCandidates(
        movement,
        data.locations,
        data.settings[0]?.timezone || "Europe/Madrid",
        previous,
      )
    : [];
  const assignments = data.assignments.filter(
    (a) => !selected || a.movementId === selected,
  );
  useEffect(() => {
    if (!mapEl.current) return;
    const m = L.map(mapEl.current, { preferCanvas: true }).setView(
      [40.4168, -3.7038],
      6,
    );
    map.current = m;
    markers.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (mode.current) {
        setManual((v) => ({
          ...v,
          lat: e.latlng.lat.toFixed(6),
          lng: e.latlng.lng.toFixed(6),
        }));
        setPlaceMode(false);
      }
    });
    return () => {
      worker.current?.terminate();
      rejectImport.current?.(new Error("Importación cancelada"));
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (data.settings[0]?.maps && online && !tiles.current)
      tiles.current = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          crossOrigin: true,
        },
      ).addTo(m);
    else if ((!data.settings[0]?.maps || !online) && tiles.current) {
      tiles.current.remove();
      tiles.current = null;
    }
  }, [data.settings, online]);
  useEffect(() => {
    const layer = markers.current;
    if (!layer) return;
    layer.clearLayers();
    const points: L.LatLngTuple[] = [];
    for (const a of assignments) {
      const l = data.locations.find((l) => l.id === a.locationId),
        m = data.movements.find((m) => m.id === a.movementId);
      if (!l || !m) continue;
      const text = document.createElement("div");
      text.textContent = `${m.merchant || m.description} · ${money(m.amount, m.currency)} · ${a.status === "confirmed" ? "Confirmado" : "Sugerido"}`;
      L.circleMarker([l.lat, l.lng], {
        radius: 8,
        color: a.status === "confirmed" ? "#285c49" : "#b9794d",
        fillOpacity: 0.9,
      })
        .bindPopup(text)
        .addTo(layer);
      points.push([l.lat, l.lng]);
    }
    for (const c of candidates.slice(0, 200)) {
      const text = document.createElement("div");
      text.textContent = `${c.location.name} · candidato sin confirmar`;
      L.circleMarker([c.location.lat, c.location.lng], {
        radius: 5,
        color: "#b99d77",
        fillOpacity: 0.4,
      })
        .bindPopup(text)
        .addTo(layer);
      points.push([c.location.lat, c.location.lng]);
    }
    if (points.length)
      map.current?.fitBounds(L.latLngBounds(points), {
        padding: [35, 35],
        maxZoom: 15,
      });
  }, [selected, data.locations, data.assignments, data.movements, previous]);
  async function readFiles(files: File[]) {
    setLoading(true);
    setBusy(true);
    setStaged(null);
    setSkipped(0);
    let all: Location[] = [];
    let omissions = 0;
    try {
      for (const file of files) {
        const result = await new Promise<{
          locations: Location[];
          skipped: number;
        }>((resolve, reject) => {
          rejectImport.current = reject;
          worker.current = new Worker(
            new URL(
              "../features/locations/timeline.worker.ts",
              import.meta.url,
            ),
            { type: "module" },
          );
          worker.current.onmessage = (e) => {
            worker.current?.terminate();
            if (e.data.error) reject(new Error(e.data.error));
            else resolve(e.data);
          };
          worker.current.onerror = () =>
            reject(new Error("No se pudo procesar el historial."));
          worker.current.postMessage(file);
        });
        all.push(...result.locations);
        omissions += result.skipped;
      }
      setStaged(
        [...new Map(all.map((l) => [l.id, l])).values()].filter(
          (l) => !data.locations.some((old) => old.id === l.id),
        ),
      );
      setSkipped(omissions);
    } catch (e) {
      notify(String(e));
    } finally {
      rejectImport.current = null;
      setLoading(false);
      setBusy(false);
    }
  }
  async function assign(
    location: Location,
    evidence: string,
    status: "suggested" | "confirmed" = "confirmed",
  ) {
    if (!movement) {
      notify("Selecciona primero un movimiento.");
      return;
    }
    await run(
      db.transaction("rw", [db.locations, db.assignments], async () => {
        await db.locations.put(location);
        await db.assignments.where("movementId").equals(movement.id).delete();
        await db.assignments.put({
          id: crypto.randomUUID(),
          movementId: movement.id,
          locationId: location.id,
          status,
          evidence,
        });
      }),
      "Ubicación guardada",
    );
  }
  function saveManual() {
    const lat = Number(manual.lat),
      lng = Number(manual.lng);
    if (
      !manual.lat ||
      !manual.lng ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      notify("Introduce coordenadas válidas.");
      return;
    }
    const now = new Date().toISOString();
    void assign(
      {
        id: crypto.randomUUID(),
        name: manual.name || "Ubicación manual",
        lat,
        lng,
        start: now,
        end: now,
        source: "manual",
      },
      "Ubicación elegida manualmente; la fecha de creación no representa la hora de la compra.",
    );
  }
  return (
    <>
      <PageTitle
        title="Cada movimiento tiene una historia"
        description="Encuentra dónde pudo ocurrir un cargo, sin compartir tu historial."
        action={
          <label className="button secondary">
            <Upload size={16} /> Importar Timeline
            <input
              type="file"
              hidden
              multiple
              accept=".json"
              disabled={loading}
              onChange={(e) => {
                if (e.target.files) void readFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
          </label>
        }
      />
      <details className="card help">
        <summary>Cómo exportar tu historial de Google Maps</summary>
        <p>
          En Google Maps del móvil abre Tu cronología → ajustes de cronología →
          Exportar datos. En algunos Android está en Ajustes del dispositivo →
          Ubicación → Servicios de ubicación → Cronología → Exportar. También
          puedes usar exportaciones antiguas de Google Takeout.
        </p>
        <p>
          Si recibes un ZIP, descomprímelo y selecciona sus archivos JSON. Se
          admiten varios archivos, de hasta 100 MB cada uno. No se conecta tu
          cuenta Google.
        </p>
        <a
          href="https://support.google.com/maps/answer/6258979"
          target="_blank"
          rel="noopener noreferrer"
        >
          Instrucciones oficiales de Google
        </a>
      </details>
      {loading && (
        <div className="notice">
          Procesando historial localmente…{" "}
          <button
            className="text-button"
            onClick={() => {
              worker.current?.terminate();
              rejectImport.current?.(new Error("Importación cancelada"));
              setLoading(false);
              setBusy(false);
              setStaged(null);
            }}
          >
            Cancelar
          </button>
        </div>
      )}
      {staged && (
        <div className="notice">
          <span>
            {staged.length} ubicaciones nuevas. {skipped} entradas sin datos
            suficientes omitidas.
          </span>
          <button
            className="button small primary"
            disabled={!staged.length}
            onClick={async () => {
              if (
                await run(
                  db.transaction("rw", db.locations, async () => {
                    for (let i = 0; i < staged.length; i += 1000)
                      await db.locations.bulkPut(staged.slice(i, i + 1000));
                  }),
                  "Historial importado",
                )
              )
                setStaged(null);
            }}
          >
            Confirmar importación
          </button>
          <button className="text-button" onClick={() => setStaged(null)}>
            Descartar
          </button>
        </div>
      )}
      <section className="card">
        <div className="map-toolbar">
          <Field label="Movimiento">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Todos los cargos con ubicación</option>
              {[...data.movements]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.date} · {m.merchant || m.description} ·{" "}
                    {money(m.amount, m.currency)}
                  </option>
                ))}
            </select>
          </Field>
          <span className="muted">
            {data.locations.length} puntos y estancias guardados
          </span>
        </div>
        <div
          className="map-container"
          ref={mapEl}
          aria-label="Mapa de ubicaciones"
        />
        {(!data.settings[0]?.maps || !online) && (
          <div className="map-offline">
            <ShieldCheck size={16} />{" "}
            {!online ? (
              "El callejero necesita conexión. Las ubicaciones guardadas siguen aquí."
            ) : (
              <>
                El callejero está desactivado.{" "}
                <Link to="/ajustes">Activar mapas en Ajustes</Link>
              </>
            )}
          </div>
        )}
      </section>
      {movement && (
        <div className="map-detail-grid">
          <section className="card">
            <div className="card-heading">
              <h2>Lugares candidatos</h2>
              <MapPin size={18} />
            </div>
            <p className="muted">
              Las coincidencias son hipótesis. Una compra online o una fecha de
              contabilización posterior pueden no corresponder con tu ubicación.
            </p>
            {!movement.timestamp && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={previous}
                  onChange={(e) => setPrevious(e.target.checked)}
                />{" "}
                Incluir los tres días anteriores
              </label>
            )}
            {candidates.slice(0, 30).map((c) => (
              <div className="candidate" key={c.location.id}>
                <strong>{c.location.name}</strong>
                <small>
                  {new Date(c.location.start).toLocaleString("es-ES", {
                    timeZone: data.settings[0]?.timezone,
                  })}{" "}
                  · {c.location.lat.toFixed(4)}, {c.location.lng.toFixed(4)}
                </small>
                <p>{c.evidence}</p>
                <div className="button-row">
                  <button
                    className="text-link"
                    onClick={() => assign(c.location, c.evidence, "suggested")}
                  >
                    Guardar sugerencia
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => assign(c.location, c.evidence)}
                  >
                    <Check size={13} /> Confirmar
                  </button>
                </div>
              </div>
            ))}
            {!candidates.length && (
              <Empty title="Sin coincidencias temporales">
                Puedes ampliar las fechas, buscar el comercio o situarlo
                manualmente.
              </Empty>
            )}
            {assignments.map((a) => (
              <div className="notice" key={a.id}>
                <span>
                  {a.status === "confirmed" ? "Confirmado" : "Sugerido"}:{" "}
                  {data.locations.find((l) => l.id === a.locationId)?.name}
                </span>
                {a.status === "suggested" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      run(
                        db.assignments.update(a.id, { status: "confirmed" }),
                        "Ubicación confirmada",
                      )
                    }
                  >
                    Confirmar
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Quitar ubicación"
                  onClick={() =>
                    run(db.assignments.delete(a.id), "Ubicación desvinculada")
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-heading">
              <h2>Ubicación manual</h2>
            </div>
            <Field label="Nombre del lugar">
              <input
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Latitud">
                <input
                  value={manual.lat}
                  onChange={(e) =>
                    setManual({ ...manual, lat: e.target.value })
                  }
                />
              </Field>
              <Field label="Longitud">
                <input
                  value={manual.lng}
                  onChange={(e) =>
                    setManual({ ...manual, lng: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setPlaceMode(!placeMode)}
              >
                <MapPin size={15} />
                {placeMode ? "Haz clic en el mapa…" : "Elegir en el mapa"}
              </button>
              <button className="button primary" onClick={saveManual}>
                Guardar ubicación
              </button>
            </div>
            <hr />
            <button
              className="text-link"
              onClick={() => setSearching(!searching)}
            >
              <Search size={15} /> Buscar un comercio en internet
            </button>
            {searching && (
              <MerchantSearch
                initialName={movement.merchant}
                onChoose={(r) => {
                  setManual({
                    name: r.name,
                    lat: String(r.lat),
                    lng: String(r.lng),
                  });
                  map.current?.setView([r.lat!, r.lng!], 16);
                }}
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
