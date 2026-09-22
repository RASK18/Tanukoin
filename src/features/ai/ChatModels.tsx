import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { Check, Download, Trash2, X, Monitor } from "lucide-react";

import { db } from "../../data/db";
import { useApp } from "../../components/ui";
import { activeChatModel, CHAT_MODELS, retiredModels } from "./models";

import { cachedModelSize, discoverCpuDownloads } from "./model-store";

import { cancelChat, prepareChatModel, removeChatModel } from "./chat-runtime";

import {
  detectHardware,
  incompatibility,
  recommendModel,
  type Hardware,
} from "./hardware";

const size = (bytes: number) =>
  `${(bytes / 1e9).toLocaleString("es", { maximumFractionDigits: 2 })} GB`;
export function ChatModels({
  disabled = false,
  onWorking,
}: {
  disabled?: boolean;
  onWorking?: (busy: boolean) => void;
}) {
  const { run, setBusy, notify } = useApp();

  const states = useLiveQuery(() => db.models.toArray(), []) || [];

  const [hardware, setHardware] = useState<Hardware>();
  const [working, setWorking] = useState<string>(),
    [progress, setProgress] = useState(0);
  const [sizes, setSizes] = useState<Record<string, number | undefined>>({});
  const active = activeChatModel(states),
    retired = retiredModels(states);

  const recommendation = hardware && recommendModel(hardware, states);
  const compatibilityIssue =
    hardware && incompatibility(CHAT_MODELS[0], hardware);

  useEffect(() => {
    onWorking?.(!!working);
  }, [working, onWorking]);
  useEffect(() => {
    void discoverCpuDownloads().catch(() => {});

    void detectHardware()
      .then(setHardware)
      .catch((e) => notify(String(e)));
  }, []);
  const retiredIds = retired.map((s) => s.id).join("|");
  useEffect(() => {
    let live = true;
    void Promise.all(
      retired.map(async (s) => [s.id, await cachedModelSize(s)] as const),
    )
      .then((entries) => {
        if (live) setSizes(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [retiredIds]);
  async function prepare(key: string, download: boolean) {
    setWorking(key);
    setBusy(true);
    setProgress(0);
    try {
      await run(
        prepareChatModel(key, download, setProgress),
        "Modelo activo y comprobado sin conexión.",
      );
    } finally {
      setWorking(undefined);
      setBusy(false);
      setHardware(await detectHardware());
    }
  }
  async function remove(key: string) {
    setWorking(key);
    setBusy(true);
    try {
      await run(
        removeChatModel(key),
        "Modelo desinstalado. Tus datos se conservan.",
      );
    } finally {
      setWorking(undefined);
      setBusy(false);
    }
  }

  return (
    <section aria-label="Modelos de Tanu" className="chat-models gpu-models">
      <h2>Elige cómo hablar con Tanu</h2>
      <p>
        Un solo modelo de chat en memoria. Puedes cambiar de opción conservando
        las descargas.
      </p>

      {compatibilityIssue && (
        <div className="notice" role="alert">
          <strong>Tanu no puede funcionar con la GPU en este navegador.</strong>
          <p>{compatibilityIssue}</p>
          <p>
            El resto de funciones de Tanukoin sigue disponible. Comprueba la
            aceleración gráfica y la configuración del navegador.
          </p>
        </div>
      )}

      <p className="notice" role="status">
        {recommendation
          ? `Recomendado: ${CHAT_MODELS.find((m) => m.key === recommendation.key)!.name}. ${recommendation.reason}`
          : "Comprobando compatibilidad del dispositivo…"}
      </p>
      {hardware && (
        <section
          className="device-profile"
          aria-labelledby="device-profile-title"
        >
          <h3 id="device-profile-title">Perfil detectado del dispositivo</h3>
          <dl className="device-profile-grid">
            <div>
              <dt>Núcleos CPU (lógicos)</dt>
              <dd>{hardware.cpuThreads ?? "No disponible"}</dd>
            </div>
            <div>
              <dt>RAM aproximada</dt>
              <dd>
                {hardware.ramGB ? `${hardware.ramGB} GB` : "No disponible"}
              </dd>
            </div>
            <div>
              <dt>WebGPU</dt>
              <dd>
                {hardware.gpu ? (
                  <>
                    <Check size={17} aria-hidden="true" /> Disponible
                  </>
                ) : (
                  "No disponible"
                )}
              </dd>
            </div>
            <div>
              <dt>Dispositivo</dt>
              <dd>
                {hardware.deviceType === "mobile"
                  ? "Móvil / tableta"
                  : hardware.deviceType === "desktop"
                    ? "Escritorio"
                    : "No disponible"}
              </dd>
            </div>
          </dl>
          <p className="muted">
            Perfil orientativo según el navegador; puede limitar los datos por
            privacidad. RAM del equipo, no VRAM. La preparación del modelo
            confirma la compatibilidad.
          </p>
        </section>
      )}

      <div>
        <div className="model-grid chat-model-grid">
          {CHAT_MODELS.map((model) => {
            const state = states.find((s) => s.id === model.key);
            const ready = state?.ready && state.revision === model.revision;
            const reason = hardware && incompatibility(model, hardware);
            const blocked = disabled || !!working || !hardware || !!reason;
            return (
              <section
                className={`card model-card ${recommendation?.key === model.key ? "recommended-model" : ""}`}

                key={model.key}
                aria-label={`Modelo ${model.name}`}
              >
                {model.experimental && (
                  <span
                    className="experimental-badge"
                    title="Pendiente de pruebas reales en equipos de 12 GB de VRAM"
                  >
                    Experimental
                  </span>
                )}

                <div className="card-heading">
                  <span className="feature-icon sage">
                    <Monitor size={22} />
                  </span>
                  <span className={`model-status ${ready ? "ready" : ""}`}>
                    {working === model.key || state?.preparing
                      ? "Preparando"
                      : ready
                        ? "Listo"
                        : state
                          ? "Necesita revisión"
                          : "Sin preparar"}
                  </span>
                </div>
                <h3>
                  {model.name}
                  {active?.key === model.key && " · En uso"}
                </h3>
                <p>{model.description}</p>

                {recommendation?.key === model.key && (
                  <p>
                    <Check size={16} /> Recomendado para este equipo
                  </p>
                )}

                {model.experimental && (
                  <p className="notice">
                    Pendiente de pruebas reales en equipos de 12 GB de VRAM
                  </p>
                )}

                <dl>
                  <dt>Descarga aproximada</dt>
                  <dd>{size(model.downloadBytes)} + recursos auxiliares</dd>
                  <dt>Requisitos</dt>
                  <dd>{model.requirements}</dd>
                </dl>
                {reason && <p className="notice">{reason}</p>}
                {state?.error && <p role="status">{state.error}</p>}
                {working === model.key && (
                  <div className="model-progress">
                    <progress
                      max="1"
                      value={progress}
                      aria-label={`Preparación de ${model.name}`}
                    />
                    <p>
                      {Math.round(progress * 100)} % · Descarga y comprobación
                      sin conexión
                    </p>
                  </div>
                )}
                <div className="button-row">
                  {ready ? (
                    <button
                      className="button primary"
                      disabled={blocked}
                      onClick={() => void prepare(model.key, false)}
                    >
                      {active?.key === model.key
                        ? "Comprobar offline"
                        : "Usar modelo"}
                    </button>
                  ) : (
                    <button
                      className="button primary"
                      disabled={blocked}
                      onClick={() => void prepare(model.key, true)}
                    >
                      <Download size={16} />
                      Descargar modelo
                    </button>
                  )}
                  {state && !ready && (
                    <button
                      className="button secondary"
                      disabled={blocked}
                      onClick={() => void prepare(model.key, false)}
                    >
                      Preparar desde caché
                    </button>
                  )}
                  {state && (
                    <button
                      className="button secondary"
                      disabled={disabled || !!working}
                      onClick={() => void remove(model.key)}
                    >
                      <Trash2 size={16} />
                      Desinstalar
                    </button>
                  )}
                  {working === model.key && (
                    <button className="button secondary" onClick={cancelChat}>
                      <X size={14} />
                      Cancelar
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {!!retired.length && (
        <section className="card" aria-label="Modelos retirados">
          <h3>Modelos retirados</h3>
          <p>
            Estos modelos ya no pueden utilizarse. Desinstálalos e instala uno
            del catálogo actual para seguir usando Tanu. Sus archivos se
            conservan hasta que los desinstales.
          </p>
          {retired.map((model) => (
            <div key={model.id} className="button-row">
              <span>
                {model.name || model.modelId || model.id} ·{" "}
                {sizes[model.id] === undefined
                  ? "Espacio ocupado no disponible"
                  : size(sizes[model.id]!)}
              </span>
              <button
                className="button secondary"
                disabled={disabled || !!working}
                onClick={() => void remove(model.id)}
              >
                <Trash2 size={16} />
                Desinstalar
              </button>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
