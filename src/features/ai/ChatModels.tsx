import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  Download,
  Trash2,
  X,
  Monitor,
  MemoryStick,
  Archive,
} from "lucide-react";

import { db } from "../../data/db";
import { useApp } from "../../components/ui";
import { activeChatModel, CHAT_MODELS, retiredModels } from "./models";

import { cachedModelSize, discoverCpuDownloads } from "./model-store";

import { cancelChat, prepareChatModel, removeChatModel } from "./chat-runtime";

import {
  checkWebGPU,
  incompatibility,
  type WebGPUCapabilities,
} from "./webgpu";

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

  const [webgpu, setWebGPU] = useState<WebGPUCapabilities>();
  const [working, setWorking] = useState<string>(),
    [progress, setProgress] = useState(0);
  const [sizes, setSizes] = useState<Record<string, number | undefined>>({});
  const active = activeChatModel(states),
    retired = retiredModels(states);

  const compatibilityIssue = webgpu && incompatibility(CHAT_MODELS[0], webgpu);

  useEffect(() => {
    onWorking?.(!!working);
  }, [working, onWorking]);
  useEffect(() => {
    void discoverCpuDownloads().catch(() => {});

    void checkWebGPU()
      .then(setWebGPU)
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
      setWebGPU(await checkWebGPU());
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

      <div className="chat-catalog-heading">
        <div>
          <h2>Modelos de chat en memoria</h2>
          <p>
            Elige un modelo para chatear. Puedes cambiar de opción conservando
            las descargas.
          </p>
        </div>
        <span
          className={`webgpu-indicator ${!webgpu ? "pending" : compatibilityIssue ? "unavailable" : "available"}`}
          role="status"
        >
          {!webgpu
            ? "Comprobando WebGPU…"
            : compatibilityIssue
              ? "WebGPU no compatible"
              : "WebGPU disponible"}
        </span>
      </div>
      <div>
        <div className="model-grid chat-model-grid">
          {CHAT_MODELS.map((model) => {
            const state = states.find((s) => s.id === model.key);
            const ready = state?.ready && state.revision === model.revision;
            const reason = webgpu && incompatibility(model, webgpu);
            const blocked = disabled || !!working || !webgpu || !!reason;
            return (
              <section
                className={`card model-card ${model.key === "chat:gpu-4b" ? "recommended-model" : ""}`}

                key={model.key}
                aria-label={`Modelo ${model.name}`}
              >
                <div className="card-heading">
                  <span className="feature-icon sage">
                    <Monitor size={20} />
                  </span>
                  <h3>
                    {model.name}
                    {active?.key === model.key && " · En uso"}
                  </h3>
                </div>
                <div className="model-badges">
                  {model.key === "chat:gpu-4b" && (
                    <span className="recommended-badge">Recomendado</span>
                  )}
                  {model.experimental && (
                    <span className="experimental-badge">Experimental</span>
                  )}
                </div>

                <p>{model.description}</p>

                <dl>
                  <dt>
                    <Download size={15} /> Descarga aproximada
                  </dt>
                  <dd>{size(model.downloadBytes)} + recursos auxiliares</dd>
                  <dt>
                    <MemoryStick size={15} /> Requisitos
                  </dt>
                  <dd>{model.requirements}</dd>
                </dl>
                <div className="model-readiness">
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
        <section className="card retired-models" aria-label="Modelos retirados">
          <div className="retired-intro">
            <span className="feature-icon cream">
              <Archive size={22} />
            </span>
            <div>
              <h3>Modelos retirados</h3>
              <p>
                Estos modelos ya no pueden utilizarse. Desinstálalos e instala
                uno del catálogo actual para seguir usando Tanu. Sus archivos se
                conservan hasta que los desinstales.
              </p>
            </div>
          </div>
          <div className="retired-list">
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
          </div>
        </section>
      )}
    </section>
  );
}
