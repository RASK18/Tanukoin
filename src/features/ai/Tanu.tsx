import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Send, X, Minus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { useApp } from "../../components/ui";
import { localDate, money } from "../../lib/finance";
import {
  askAssistant,
  emptyConversation,
  type AssistantReply,
} from "./assistant";
import { cancelChat } from "./chat-runtime";
import { activeChatModel } from "./models";
import { reconcileChatModels } from "./model-store";
import { MerchantSearch } from "../locations/MerchantSearch";

type Message = {
  role: "user" | "assistant";
  text: string;
  reply?: AssistantReply;
};
export function Tanu() {
  const { data, notify } = useApp();
  const states = useLiveQuery(() => db.models.toArray(), []) || [];
  const model = activeChatModel(states);
  const [open, setOpen] = useState(false),
    [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false);
  const conversation = useRef(emptyConversation());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void reconcileChatModels().catch((e) => notify(String(e)));
  }, []);
  const status = states.some((s) => s.preparing)
    ? "Preparando"
    : model
      ? "Listo"
      : states.some((s) => s.error)
        ? "Necesita revisión"
        : "Sin preparar";
  async function ask(text: string) {
    if (!text.trim() || busy || !model) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const reply = await askAssistant(
        text,
        conversation.current,
        data,
        localDate(),
      );
      conversation.current = reply.state;
      setMessages((m) => [
        ...m,
        { role: "assistant", text: reply.text, reply },
      ]);
    } catch (error) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "El chat local ha fallado. Revisa el modelo en IA local.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  return (
    <>
      <button
        className={`tanu-launcher ${open ? "opened" : ""}`}
        aria-label={open ? "Cerrar chat de Tanu" : "Hablar con Tanu"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <X size={23} />
        ) : (
          <img src={`${import.meta.env.BASE_URL}tanu.webp`} alt="" />
        )}
        {!open && <span>¿Te echo una mano?</span>}
      </button>
      {open && (
        <section className="tanu-chat" aria-label="Chat de Tanu">
          <header>
            <img src={`${import.meta.env.BASE_URL}tanu.webp`} alt="" />
            <div>
              <strong>Tanu {model && <i className="status-dot" />}</strong>
              <small>IA local · {status}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Borrar conversación"
              disabled={busy}
              onClick={() => {
                setMessages([]);
                conversation.current = emptyConversation();
              }}
            >
              <Trash2 size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Minimizar Tanu"
              onClick={() => setOpen(false)}
            >
              <Minus size={18} />
            </button>
          </header>
          <div className="chat-scroll" ref={scroller} aria-live="polite">
            {!model ? (
              <div className="chat-setup">
                <p>
                  Para hablar conmigo, descarga un modelo en{" "}
                  <strong>IA local</strong>. Elige el recomendado y pulsa{" "}
                  <strong>Descargar modelo</strong>. Cuando esté listo, podrás
                  chatear conmigo.
                </p>
                <Link
                  to="/ia"
                  className="button secondary small"
                  onClick={() => setOpen(false)}
                >
                  IA local <Sparkles size={13} />
                </Link>
              </div>
            ) : (
              <>
                {!messages.length && (
                  <>
                    <div className="chat-welcome">
                      <span className="feature-icon sage">
                        <Sparkles size={20} />
                      </span>
                      <h3>
                        Un poco de claridad,
                        <br />
                        una pregunta a la vez.
                      </h3>
                      <p>
                        Busca movimientos, calcula estadísticas y resuelve dudas
                        sobre Tanukoin. Todo aquí.
                      </p>
                    </div>
                    <div className="chat-suggestions">
                      {[
                        "¿Cuánto he gastado este mes?",
                        "¿Cuál es mi mayor gasto este mes?",
                        "¿Cómo importo mis movimientos?",
                      ].map((text) => (
                        <button
                          key={text}
                          disabled={busy}
                          onClick={() => void ask(text)}
                        >
                          {text}
                          <Send size={11} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {messages.map((m, i) => (
                  <div className={`chat-message ${m.role}`} key={i}>
                    <p>{m.text}</p>
                    {m.reply?.result?.filters && (
                      <small className="chat-filters">
                        {m.reply.result.filters}
                      </small>
                    )}
                    {!!m.reply?.result?.rows.length && (
                      <details>
                        <summary>
                          Ver movimientos utilizados (
                          {m.reply.result.rows.length})
                        </summary>
                        {m.reply.result.rows.map((r) => (
                          <Link
                            key={r.id}
                            to={
                              m.reply?.query?.op === "locations"
                                ? `/mapa?id=${r.id}`
                                : `/movimientos?id=${r.id}`
                            }
                            onClick={() => setOpen(false)}
                          >
                            {r.date} · {r.merchant || r.description}
                            <strong>{money(r.amount, r.currency)}</strong>
                          </Link>
                        ))}
                      </details>
                    )}
                    {m.reply?.links?.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setOpen(false)}
                      >
                        {link.label}
                      </Link>
                    ))}
                    {m.reply?.kind === "merchant" && (
                      <MerchantSearch
                        initialName={m.reply.query?.publicName}
                        initialCity={m.reply.query?.city}
                      />
                    )}
                  </div>
                ))}
                {busy && (
                  <p className="thinking">
                    Tanu está pensando…{" "}
                    <button className="text-link" onClick={cancelChat}>
                      Cancelar respuesta
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
          {model && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <input
                aria-label="Pregunta a Tanu"
                placeholder="Pregunta sobre tus finanzas o Tanukoin…"
                value={input}
                disabled={busy}
                maxLength={1000}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                aria-label="Enviar pregunta"
                disabled={busy || !input.trim()}
              >
                <Send size={17} />
              </button>
            </form>
          )}
          <footer>
            <ShieldCheck size={11} /> El chat no modifica tus movimientos.
          </footer>
        </section>
      )}
    </>
  );
}
