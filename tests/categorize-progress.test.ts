import { afterEach, expect, it, vi } from "vitest";
import { db } from "../src/data/db";
import { categorize, cancelModel } from "../src/features/ai/client";
import { MODEL_REVISION } from "../src/features/ai/constants";
import { buildCandidates, defaultProfile } from "../src/features/import/parse";

afterEach(() => {
  cancelModel("embeddings");
  vi.unstubAllGlobals();
});

it("informa del progreso real por lotes y reutiliza la caché sin cambiar categorías manuales", async () => {
  await db.delete();
  await db.open();
  await db.models.put({
    id: "embeddings",
    ready: true,
    revision: MODEL_REVISION,
    savedAt: new Date().toISOString(),
  });
  const embed = vi.fn();
  vi.stubGlobal(
    "Worker",
    class {
      onmessage?: (event: { data: unknown }) => void;
      terminate() {}
      postMessage(message: { id: string; texts: string[] }) {
        embed(message.texts);
        queueMicrotask(() =>
          this.onmessage?.({
            data: { id: message.id, result: message.texts.map(() => [1, 0]) },
          }),
        );
      }
    },
  );
  const movements = buildCandidates(
    [
      ["Fecha", "Concepto", "Importe"],
      ...Array.from({ length: 34 }, (_, i) => [
        "15/09/2026",
        `Compra ficticia ${i}`,
        "-1,00",
      ]),
    ],
    defaultProfile,
    { id: "a", name: "Cuenta", bank: "", currency: "EUR" },
    "ficticio.csv",
    [],
  ).candidates.map((c) => c.movement);
  movements[0].categorySource = "manual";
  movements[0].categoryId = "manual";
  const categories = [
    {
      id: "food",
      name: "Comida",
      description: "Alimentación",
      color: "#000000",
      icon: "ShoppingBasket",
    },
  ];
  const progress = vi.fn();
  const result = await categorize(movements, categories, [], progress);
  expect(progress.mock.calls).toEqual([
    [0, 33],
    [16, 33],
    [32, 33],
    [33, 33],
  ]);
  expect(result[0]).toEqual(movements[0]);
  expect(result.slice(1).every((m) => m.categoryId === "food")).toBe(true);
  embed.mockClear();
  progress.mockClear();
  await categorize(movements, categories, [], progress);
  expect(progress.mock.calls).toEqual([[33, 33]]);
  expect(embed).not.toHaveBeenCalled();
  movements[1].tagIds = ["japan"];
  const tree = [
    { ...categories[0], id: "root", name: "Gastos" },
    { ...categories[0], parentId: "root" },
  ];
  const tagged = await categorize(movements, tree, [], progress);
  expect(tagged[1].tagIds).toEqual(["japan"]);
  expect((await db.embeddings.get("category:food"))?.text).toBe(
    "Gastos → Comida: Alimentación",
  );
  embed.mockClear();
  await categorize(
    movements,
    [{ ...tree[0], name: "Hogar" }, tree[1]],
    [],
    progress,
  );
  expect(embed).toHaveBeenCalledWith([
    "Hogar: Alimentación",
    "Hogar → Comida: Alimentación",
  ]);
  expect((await db.models.get("embeddings"))?.ready).toBe(true);
});
