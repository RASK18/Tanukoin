import { validAutomaticCategory } from "../data/classification";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Download,
  Sparkles,
  Check,
  Trash2,
  Cpu,
  X,
  LockKeyhole,
  Tags,
  Zap,
  Target,
  ShieldCheck,
} from "lucide-react";
import "./ai-page.css";
import { db } from "../data/db";
import { useApp, PageTitle } from "../components/ui";
import {
  prepareModel,
  removeModel,
  cancelModel,
  categorize,
} from "../features/ai/client";
import { ChatModels } from "../features/ai/ChatModels";
export function AIPage() {
  const { data, run, notify, setBusy } = useApp();
  const models = useLiveQuery(() => db.models.toArray(), []) || [];
  const [working, setWorking] = useState<"embeddings" | "chat" | null>(null),
    [progress, setProgress] = useState(0),
    [classifying, setClassifying] = useState(false),
    [chatWorking, setChatWorking] = useState(false);
  async function prepare(id: "embeddings" | "chat", download: boolean) {
    setWorking(id);
    setBusy(true);
    setProgress(0);
    try {
      if (
        await run(
          prepareModel(id, download, setProgress),
          "Modelo comprobado: disponible sin conexión.",
        )
      )
        setProgress(1);
    } finally {
      setWorking(null);
      setBusy(false);
    }
  }
  return (
    <div className="ai-page">
      <PageTitle
        eyebrow="INTELIGENCIA QUE SE QUEDA CONTIGO"
        title="IA local, de verdad"
        description="Los modelos se descargan en tu dispositivo. Tus movimientos y preguntas se quedan aquí."
        action={
          <div className="ai-privacy">
            <div className="ai-privacy-note">
              <LockKeyhole size={22} />
              <span>
                <strong>100% en tu dispositivo</strong>
                <small>Tus consultas se procesan aquí.</small>
              </span>
            </div>
            <img src={`${import.meta.env.BASE_URL}tanu.webp`} alt="" />
            <span className="ai-privacy-script">
              Tu privacidad
              <br />
              es tu poder ♡
            </span>
          </div>
        }
      />
      <ChatModels
        disabled={working !== null || classifying}
        onWorking={setChatWorking}
      />
      <div className="ai-tools-grid">
        {(
          [
            {
              id: "embeddings",
              title: "Orden y búsqueda inteligente",
              subtitle: "EMBEDDINGS",
              Icon: Cpu,
              description:
                "Categoriza por similitud y encuentra movimientos aunque no recuerdes las palabras exactas.",
              model: "MiniLM multilingüe · cuantizado",
              size: "Aproximadamente 118 MB + recursos auxiliares",
              requirements: "Funciona con CPU / WebAssembly.",
            },
          ] as const
        ).map((m) => {
          const state = models.find((s) => s.id === m.id);
          return (
            <section className="card model-card" key={m.id}>
              <div className="card-heading">
                <span className="feature-icon sage">
                  <m.Icon size={22} />
                </span>
                <span className={`model-status ${state?.ready ? "ready" : ""}`}>
                  {state?.ready ? (
                    <>
                      <Check size={13} /> Caché comprobada
                    </>
                  ) : (
                    "Sin preparar"
                  )}
                </span>
              </div>
              <span className="eyebrow">{m.subtitle}</span>
              <h2>{m.title}</h2>
              <p>{m.description}</p>
              <dl>
                <dt>Modelo</dt>
                <dd>{m.model}</dd>
                <dt>Almacenamiento</dt>
                <dd>{m.size}</dd>
                <dt>Compatibilidad</dt>
                <dd>{m.requirements}</dd>
              </dl>
              {working === m.id && (
                <div className="model-progress">
                  <progress max="1" value={progress} />
                  <p>
                    {Math.round(progress * 100)} % · Descargando o comprobando
                    los archivos en caché…
                  </p>
                </div>
              )}
              <div className="button-row">
                <button
                  disabled={working !== null || chatWorking}
                  className="button primary"
                  onClick={() => prepare(m.id, true)}
                >
                  <Download size={16} />
                  {state?.ready ? "Reparar descarga" : "Descargar modelo"}
                </button>
                <button
                  disabled={working !== null || chatWorking}
                  className="button secondary"
                  onClick={() => prepare(m.id, false)}
                >
                  Comprobar offline
                </button>
                <button
                  disabled={working !== null || chatWorking}
                  className="icon-button"
                  aria-label={`Eliminar modelo ${m.title}`}
                  onClick={() =>
                    run(
                      removeModel(m.id),
                      "Modelo eliminado; tus datos se conservan",
                    )
                  }
                >
                  <Trash2 size={17} />
                </button>
                {working === m.id && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      cancelModel(m.id);
                    }}
                  >
                    <X size={14} /> Cancelar
                  </button>
                )}
              </div>
            </section>
          );
        })}
        <section className="card ai-categorization">
          <div className="card-heading">
            <span className="feature-icon sage">
              <Tags size={23} />
            </span>
            <h2>Categorización de tu historial</h2>
          </div>
          <p>
            Se respetan tus categorías manuales y reglas. La IA asigna las
            coincidencias claras; las dudosas aparecen como sugerencias. Puedes
            revertir las asignaciones automáticas.
          </p>
          <div className="ai-benefits">
            <span>
              <Zap size={18} /> Menos trabajo manual
            </span>
            <span>
              <Target size={18} /> Sugerencias locales
            </span>
            <span>
              <ShieldCheck size={18} /> Tus decisiones se respetan
            </span>
          </div>
          <div className="button-row">
            <button
              className="button primary"
              disabled={
                classifying ||
                chatWorking ||
                working !== null ||
                !models.find((m) => m.id === "embeddings")?.ready ||
                !data.movements.length
              }
              onClick={async () => {
                setClassifying(true);
                setBusy(true);
                try {
                  const result = await categorize(
                    data.movements,
                    data.categories,
                    data.movements,
                  );
                  await run(
                    db.transaction(
                      "rw",
                      [db.movements, db.categories],
                      async () => {
                        const categories = new Set(
                          (await db.categories.toArray()).map((c) => c.id),
                        );
                        for (const proposal of result) {
                          const row = validAutomaticCategory(
                            proposal,
                            categories,
                          );
                          const latest = await db.movements.get(row.id);
                          if (
                            latest &&
                            (latest.categorySource === "none" ||
                              latest.categorySource === "ai")
                          )
                            await db.movements.update(row.id, {
                              categoryId: row.categoryId,
                              categorySource: row.categorySource,
                              aiSuggestion: row.aiSuggestion,
                            });
                        }
                      },
                    ),
                    "Categorización terminada. Revisa las sugerencias en Movimientos.",
                  );
                } catch (e) {
                  notify(String(e));
                } finally {
                  setClassifying(false);
                  setBusy(false);
                }
              }}
            >
              <Sparkles size={16} />
              {classifying
                ? "Analizando localmente…"
                : "Categorizar movimientos"}
            </button>
            <button
              className="button secondary"
              onClick={() =>
                run(
                  db.movements
                    .filter((m) => m.categorySource === "ai")
                    .modify({
                      categoryId: undefined,
                      categorySource: "none",
                      aiSuggestion: undefined,
                    }),
                  "Asignaciones automáticas revertidas",
                )
              }
            >
              Revertir categorías de IA
            </button>
          </div>
        </section>
      </div>
      <p className="muted ai-storage-note">
        El navegador puede eliminar su almacenamiento. Si falta algún archivo
        del modelo, se solicitará descargarlo otra vez; nunca se usará una IA
        remota como alternativa.
      </p>
    </div>
  );
}
