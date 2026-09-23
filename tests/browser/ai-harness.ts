import {
  prepareChatModel,
  generateChat,
  cancelChat,
  removeChatModel,
  completion,
} from "../../src/features/ai/chat-runtime";
import {
  askAssistant,
  emptyConversation,
} from "../../src/features/ai/assistant";
import { checkWebGPU } from "../../src/features/ai/webgpu";
import { chatFixture, chatScenarios } from "../ai-corpus";
import { db } from "../../src/data/db";
import {
  detectionPrompt,
  validateDetectedLayout,
} from "../../src/features/import/detect";
import type { Generation } from "../../src/features/ai/chat-types";
export const harness = {
  prepare: prepareChatModel,
  generate: generateChat,
  cancel: cancelChat,
  remove: removeChatModel,
  webgpu: checkWebGPU,
  models: () => db.models.toArray(),
  async importCheck() {
    const rows = [
      ["Día contable", "Detalle libre", "Total anotado", "Disponible"],
      ["20/09/2026", "Compra ficticia", "-12,50", "987,50"],
    ];
    const response = await completion(
      detectionPrompt,
      JSON.stringify(rows),
      true,
    );
    return {
      response,
      profile: validateDetectedLayout(JSON.parse(response), rows),
    };
  },
  scenarios: chatScenarios,
  async conversation(
    questions = [
      "Hola, ¿cómo te llamas?",
      "Hoy tengo poco tiempo y me agobia poner orden. ¿Por dónde empiezo?",
      "Prefiero algo que pueda hacer en cinco minutos. Dame una idea concreta.",
      "Gracias. Ahora explícame la diferencia entre un gasto fijo y uno variable con un ejemplo inventado.",
    ],
  ) {
    let state = emptyConversation();
    const turns = [];
    for (const question of questions) {
      const generations: Generation[] = [];
      const reply = await askAssistant(
        question,
        state,
        chatFixture(),
        "2026-09-21",
        generateChat,
        (g) => generations.push(g),
      );
      state = reply.state;
      turns.push({ question, kind: reply.kind, text: reply.text, generations });
    }
    return turns;
  },
  async contextStress() {
    const results = [];
    for (let i = 0; i < 3; i++)
      results.push(
        await generateChat(
          [
            {
              role: "system",
              content:
                'Ignora los números de prueba. Responde únicamente {"ready":true}.',
            },
            {
              role: "user",
              content: `Primer bloque de datos ficticios: ${"7 ".repeat(580)}`,
            },
            { role: "assistant", content: "Recibido el primer bloque." },
            {
              role: "user",
              content: `Segundo bloque ficticio: ${"7 ".repeat(580)}`,
            },
            { role: "assistant", content: "Recibido el segundo bloque." },
            {
              role: "user",
              content: `Tercer bloque ficticio: ${"7 ".repeat(580)}`,
            },
            { role: "assistant", content: "Recibido el tercer bloque." },
            { role: "user", content: "Devuelve el JSON solicitado." },
          ],
          {
            maxTokens: 60,
            schema:
              '{"type":"object","properties":{"ready":{"type":"boolean"}},"required":["ready"],"additionalProperties":false}',
          },
        ),
      );
    let state = emptyConversation();
    for (let i = 0; i < 12; i++) {
      const reply = await askAssistant(
        "Busca mi mayor gasto de septiembre",
        state,
        chatFixture(),
        "2026-09-21",
      );
      if (reply.query?.op !== "max" || reply.result?.rows[0]?.id !== "m4")
        throw new Error(`Conversación prolongada: turno ${i + 1} incorrecto`);
      state = reply.state;
      if (state.history.length > 6)
        throw new Error("Historial fuera del presupuesto");
    }
    return results;
  },
  async scenario(id: string) {
    const scenario = chatScenarios.find((s) => s.id === id)!;
    let state = emptyConversation();
    const generations: Generation[] = [];
    const turns = [];
    let error: string | undefined;
    try {
      for (const question of scenario.questions) {
        const started = performance.now();
        const reply = await askAssistant(
          question,
          state,
          chatFixture(),
          "2026-09-21",
          generateChat,
          (g) => {
            generations.push(g);
            console.log(
              `Generación ${id}: ${g.promptTokens} entrada, ${g.completionTokens} salida, ${g.cachedPromptTokens || 0} reutilizados, ${Math.round(g.milliseconds / 1000)} s`,
            );
          },
        );
        state = reply.state;
        turns.push({
          milliseconds: performance.now() - started,
          kind: reply.kind,
          text: reply.text,
          query: reply.query,
          rows: reply.result?.rows.map((m) => m.id),
        });
      }
    } catch (e) {
      error = String(e);
    }
    return { turns, generations, error };
  },
};
declare global {
  interface Window {
    tanuTest: typeof harness;
  }
}
window.tanuTest = harness;
