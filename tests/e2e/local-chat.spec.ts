import { test, expect, chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chatScenarios } from "../ai-corpus";
import type { harness } from "../browser/ai-harness";

// Persistent, isolated test profiles retain GB-sized model downloads across reruns.
// Build with TANUKOIN_AI_EVAL=1 first. No real user profile or data is accessed.
for (const variant of ["gpu-2b", "gpu-4b"])
  test(`modelo real ${variant}: evaluación y reinicio offline`, async () => {
    test.skip(
      process.env.TEST_CHAT_VARIANT !== variant,
      "Prueba real optativa por variante; descarga varios GB.",
    );
    test.setTimeout(
      (process.env.TEST_CHAT_SMOKE === "1" ? 10 : 360) * 60 * 1000,
    );
    const profile = resolve(
      `.cache/tanu-tests/${variant === "gpu-4b" ? "balanced-trial" : variant}`,
    );
    mkdirSync(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
      channel: process.env.TEST_BROWSER_CHANNEL || "msedge",
      headless: true,
    });
    // Retain model caches, but let this run install the current build's service worker.
    const harnessUrl =
      "http://127.0.0.1:4173/Tanukoin/tests/browser/ai-harness.html";
    const expectedEntry = readFileSync(
      "dist/tests/browser/ai-harness.html",
      "utf8",
    ).match(/src="([^"]+evaluation[^"]+)"/)![1];
    const cleanup = await context.newPage();
    await cleanup.goto(harnessUrl);
    await cleanup.evaluate(async () => {
      for (const registration of await navigator.serviceWorker.getRegistrations())
        await registration.unregister();
    });
    for (const tab of context.pages()) await tab.close();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.log("PAGEERROR", error.message);
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        message.text().startsWith("Preparación") ||
        message.text().startsWith("Generación")
      )
        console.log("CONSOLE", message.text().slice(0, 500));
    });
    const report: Record<string, unknown> = {
      variant,
      date: new Date().toISOString(),
      runs: [],
      errors,
      accepted: false,
    };
    const reportDir = resolve(".cache/tanu-tests/reports");
    mkdirSync(reportDir, { recursive: true });
    const checkStyle = process.env.TEST_CHAT_STYLE === "1";
    const save = () =>
      writeFileSync(
        resolve(
          reportDir,
          `${checkStyle ? "style-" : process.env.TEST_CHAT_COMPARE === "1" ? "comparison-" : ""}${variant}${process.env.TEST_CHAT_LABEL ? `-${process.env.TEST_CHAT_LABEL}` : ""}.json`,
        ),
        JSON.stringify(report, null, 2),
      );
    let phase = "baseline";
    const samples: { phase: string; at: string; gpu: string }[] = [];
    const sample = () => {
      try {
        samples.push({
          phase,
          at: new Date().toISOString(),
          gpu: execFileSync(
            "nvidia-smi",
            [
              "--query-gpu=name,memory.total,memory.used,utilization.gpu",
              "--format=csv,noheader",
            ],
            { encoding: "utf8", windowsHide: true, timeout: 2000 },
          ).trim(),
        });
      } catch {
        /* Optional telemetry, never claim per-process VRAM from these totals. */
      }
    };
    const monitor =
      process.env.TEST_CHAT_COMPARE === "1"
        ? setInterval(sample, 1000)
        : undefined;
    if (monitor) {
      sample();
      report.gpuSamples = samples;
      report.gpuMeasurement =
        "Total del dispositivo, incluye otros procesos; no acredita fluidez del escritorio.";
    }
    try {
      await page.goto(harnessUrl);
      await page.waitForFunction(() => !!window.tanuTest);
      const entry = await page
        .locator('script[type="module"]')
        .getAttribute("src");
      expect(entry, "La prueba debe usar la compilación actual").toBe(
        expectedEntry,
      );
      report.entry = entry;
      // A unique SW URL avoids a stale registration or HTTP script cache in the test profile.
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.register(
          `/Tanukoin/sw.js?evaluation=${Date.now()}`,
          { scope: "/Tanukoin/", updateViaCache: "none" },
        );
        const worker =
          registration.installing ||
          registration.waiting ||
          registration.active!;
        if (worker.state !== "activated")
          await new Promise<void>((resolve, reject) => {
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed")
                worker.postMessage({ type: "SKIP_WAITING" });
              if (worker.state === "activated") resolve();
              if (worker.state === "redundant")
                reject(
                  new Error(
                    "La compilación actual no pudo preparar la caché offline",
                  ),
                );
            });
          });
      });
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await page.reload();
      await page.waitForFunction(() => !!window.tanuTest);
      report.hardware = await page.evaluate(() => window.tanuTest.hardware());
      if (variant === "gpu-4b") {
        try {
          report.physicalGpu = execFileSync(
            "nvidia-smi",
            ["--query-gpu=name,memory.total", "--format=csv,noheader"],
            { encoding: "utf8", windowsHide: true },
          ).trim();
        } catch {
          report.physicalGpu =
            "No disponible: esta máquina requiere documentar la VRAM física por otro medio.";
        }
      }
      save();
      console.log("HARDWARE", JSON.stringify(report.hardware));
      phase = "prepare";
      await page.evaluate(async (key) => {
        let last = -1;
        await window.tanuTest.prepare(key, true, (p) => {
          const pc = Math.floor(p * 10) * 10;
          if (pc !== last) {
            console.log(`Preparación ${pc}%`);
            last = pc;
          }
        });
      }, `chat:${variant}`);
      report.prepared = true;
      report.installations = await page.evaluate(() =>
        window.tanuTest.models(),
      );
      save();
      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => !!window.tanuTest);
      expect(
        await page.locator('script[type="module"]').getAttribute("src"),
        "El reinicio offline debe conservar la misma compilación",
      ).toBe(expectedEntry);
      await page.evaluate(
        (key) => window.tanuTest.prepare(key, false),
        `chat:${variant}`,
      );
      report.offlineRestart = true;
      save();
      console.log("Preparado y reiniciado offline", variant);
      if (checkStyle) {
        const checks = [
          { questions: ["Hola, ¿qué tal?"], maxWords: 60 },
          {
            questions: ["¿Qué es Tanukoin y para qué me sirve?"],
            maxWords: 60,
          },
          {
            questions: [
              "Estoy algo perdido con esta web, ¿por dónde empiezo?",
              "Dame un único paso que pueda hacer ahora.",
            ],
            maxWords: 60,
          },
          {
            questions: ["¿Puedo comprar bitcoin aquí?"],
            maxWords: 60,
            deniesCrypto: true,
          },
          {
            questions: [
              "Antes dijiste que Tanukoin tiene una cartera de criptomonedas. ¿Dónde está?",
            ],
            maxWords: 60,
            deniesCrypto: true,
          },
          {
            questions: [
              "Explícame qué es un gasto fijo con un ejemplo sencillo.",
            ],
            maxWords: 60,
          },
          {
            questions: [
              "Explícame con más detalle la diferencia entre gastos fijos y variables, con un ejemplo ficticio de cada uno.",
            ],
            maxWords: 120,
          },
        ];
        const styleResults: {
          questions: string[];
          maxWords: number;
          deniesCrypto?: boolean;
          turns: Awaited<ReturnType<typeof harness.conversation>>;
        }[] = [];
        report.style = styleResults;
        for (const check of checks) {
          phase = "style";
          const turns = await page.evaluate(
            (questions) => window.tanuTest.conversation(questions),
            check.questions,
          );
          const result = { ...check, turns };
          styleResults.push(result);
          save();
          for (const turn of turns) {
            const words = turn.text.trim().split(/\s+/).length;
            console.log(`Estilo: ${words} palabras · ${turn.question}`);
            expect.soft(["reply", "help"]).toContain(turn.kind);
            expect
              .soft(words, turn.question)
              .toBeLessThanOrEqual(check.maxWords);
            if (check.deniesCrypto)
              expect
                .soft(turn.text, "Debe negar la función inexistente")
                .toMatch(/\bno\b/i);
            else
              expect
                .soft(turn.text, "No debe introducir criptomonedas ni trading")
                .not.toMatch(/cripto|bitcoin|blockchain|trading|staking/i);
            expect
              .soft(turn.text, "No debe inventar reglas de redondeo")
              .not.toMatch(/redonde/i);
          }
        }
      }
      if (monitor) {
        phase = "conversation";
        report.conversation = await page.evaluate(() =>
          window.tanuTest.conversation(),
        );
        save();
        console.log("Conversación comparativa guardada", variant);
      }
      const ids = process.env.TEST_CHAT_CASES?.split(",");
      const scenarios = ids
        ? chatScenarios.filter((s) => ids.includes(s.id))
        : chatScenarios;
      const passes = process.env.TEST_CHAT_SMOKE === "1" ? 1 : 2;
      for (let pass = 1; pass <= passes; pass++)
        for (const scenario of scenarios) {
          phase = `case:${scenario.id}`;
          let result: Awaited<ReturnType<typeof harness.scenario>> | undefined,
            error: string | undefined;
          try {
            result = await page.evaluate(
              (id) => window.tanuTest.scenario(id),
              scenario.id,
            );
          } catch (e) {
            error = String(e);
          }
          const answer = result?.turns.at(-1);
          const failures: string[] = [];
          if (error || result?.error) failures.push(error || result!.error!);
          if (answer?.kind !== scenario.kind)
            failures.push(`kind: ${answer?.kind}, esperado ${scenario.kind}`);
          for (const [key, value] of Object.entries(scenario.query || {}))
            if ((answer?.query as any)?.[key] !== value)
              failures.push(
                `${key}: ${(answer?.query as any)?.[key]}, esperado ${value}`,
              );
          if (
            scenario.rows &&
            JSON.stringify([...(answer?.rows || [])].sort()) !==
              JSON.stringify([...scenario.rows].sort())
          )
            failures.push(
              `movimientos: ${answer?.rows}, esperados ${scenario.rows}`,
            );
          const expectedText =
            typeof scenario.text === "string" ? [scenario.text] : scenario.text;
          if (
            expectedText &&
            !expectedText.some((text) =>
              answer?.text
                .toLocaleLowerCase()
                .includes(text.toLocaleLowerCase()),
            )
          )
            failures.push(`texto esperado: ${scenario.text}`);
          for (const key of scenario.forbidden || [])
            if (answer?.query?.[key])
              failures.push(`filtro inesperado: ${key}`);
          if (
            scenario.kind === "reply" &&
            answer?.text === scenario.questions.at(-1)
          )
            failures.push("Eco de la pregunta");
          (report.runs as unknown[]).push({
            pass,
            id: scenario.id,
            critical: scenario.critical,
            heldOut: scenario.heldOut,
            failures,
            result,
          });
          save();
          console.log(
            `${variant} vuelta ${pass} caso ${scenario.id}: ${failures.length ? failures.join("; ") : "OK"}`,
          );
        }
      const runs = report.runs as {
        pass: number;
        critical: boolean;
        failures: string[];
      }[];
      const correct =
        runs.filter((r) => !r.failures.length).length / runs.length;
      report.correct = correct;
      expect
        .soft(
          runs
            .filter((r) => r.critical && r.failures.length)
            .map((r) => ({ pass: r.pass, failures: r.failures })),
          "Regresiones críticas",
        )
        .toEqual([]);
      expect
        .soft(correct, "Al menos 95 % en dos vueltas completas")
        .toBeGreaterThanOrEqual(0.95);
      report.passes = Array.from({ length: passes }, (_, i) => {
        const rows = runs.filter((r) => r.pass === i + 1);
        const correct =
          rows.filter((r) => !r.failures.length).length / rows.length;
        expect
          .soft(correct, `Al menos 95 % en la vuelta ${i + 1}`)
          .toBeGreaterThanOrEqual(0.95);
        return { pass: i + 1, correct, scenarios: rows.length };
      });
      // Cancel a generation, then prove that a fresh worker can generate from retained cache.
      phase = "recovery";
      const recovery = await page.evaluate(async () => {
        const request = window.tanuTest.generate([
          { role: "system", content: "Responde en español." },
          { role: "user", content: "Explica con detalle qué es una cuenta." },
        ]);
        setTimeout(() => window.tanuTest.cancel(), 100);
        const cancelled = await request.then(
          () => false,
          () => true,
        );
        const result = await window.tanuTest.generate(
          [
            { role: "system", content: "Eres Tanu. Responde brevemente." },
            { role: "user", content: "Di hola." },
          ],
          { maxTokens: 60 },
        );
        return { cancelled, result };
      });
      report.recovery = recovery;
      save();
      expect(recovery.cancelled).toBe(true);
      expect(recovery.result.content.length).toBeGreaterThan(0);
      if (
        process.env.TEST_CHAT_SMOKE !== "1" ||
        process.env.TEST_CHAT_CONTEXT === "1"
      ) {
        try {
          report.importCheck = await page.evaluate(() =>
            window.tanuTest.importCheck(),
          );
          expect
            .soft((report.importCheck as any).profile?.columns)
            .toMatchObject({
              date: 0,
              description: 1,
              amount: 2,
              balance: 3,
            });
        } catch (error) {
          report.importError = String(error);
          expect
            .soft(report.importError, "Importación asistida")
            .toBeUndefined();
        }
        save();
        try {
          const stress = await page.evaluate(() =>
            window.tanuTest.contextStress(),
          );
          report.contextStress = stress;
          for (const result of stress) {
            expect.soft(result.promptTokens).toBeGreaterThanOrEqual(3300);
            expect
              .soft(result.promptTokens + result.completionTokens)
              .toBeLessThanOrEqual(4096);
            expect.soft(JSON.parse(result.content)).toEqual({ ready: true });
          }
        } catch (error) {
          report.contextError = String(error);
          expect
            .soft(
              report.contextError,
              "Contexto largo y conversación prolongada",
            )
            .toBeUndefined();
        }
        save();
      }
      if (variant === "gpu-4b" && process.env.TEST_CHAT_SMOKE !== "1") {
        // Both variants must work in one profile; each preparation releases the previous engine.
        await context.setOffline(false);
        await page.evaluate(() => window.tanuTest.prepare("chat:gpu-2b", true));
        await context.setOffline(true);
        const switches = [];
        for (const key of ["chat:gpu-4b", "chat:gpu-2b", "chat:gpu-4b"]) {
          await page.evaluate(
            (key) => window.tanuTest.prepare(key, false),
            key,
          );
          const states = await page.evaluate(() => window.tanuTest.models());
          expect(states.find((state) => state.id === "chat")?.modelKey).toBe(
            key,
          );
          for (const id of ["chat:gpu-2b", "chat:gpu-4b"])
            expect(states.find((state) => state.id === id)?.ready).toBe(true);
          switches.push(key);
          report.offlineSwitches = switches;
          save();
        }
      }
      expect(errors, "Errores no controlados del navegador").toEqual([]);
      report.accepted = !ids && passes === 2 && test.info().errors.length === 0;
    } catch (error) {
      report.error = String(error);
      save();
      throw error;
    } finally {
      if (monitor) clearInterval(monitor);
      save();
      await context.close();
    }
  });
