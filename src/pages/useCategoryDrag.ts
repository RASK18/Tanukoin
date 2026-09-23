import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { projectCategoryGap, type CategoryRow } from "../lib/category-sort";
import type { CategoryDrop } from "../data/classification";

type Drag = ReturnType<typeof projectCategoryGap> & {
  id: string;
  branch: CategoryRow[];
  remaining: CategoryRow[];
  height: number;
  x: number;
  y: number;
  keyboard: boolean;
  valid: boolean;
};
export function useCategoryDrag(
  rows: CategoryRow[],
  commit: (id: string, drop: CategoryDrop) => Promise<void>,
) {
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag>();
  const active = useRef<Drag | undefined>(undefined);
  const pending = useRef<
    | { id: string; x: number; y: number; depth: number; step: number }
    | undefined
  >(undefined);
  const latest = useRef({ rows, commit });
  latest.current = { rows, commit };
  const point = useRef({ x: 0, y: 0 });
  const previousRects = useRef(new Map<string, number>());
  const finishing = useRef(false);
  function publish(value?: Drag) {
    active.current = value;
    setDrag(value);
  }
  function begin(id: string, x: number, y: number, keyboard: boolean) {
    const all = latest.current.rows;
    const start = all.findIndex((r) => r.category.id === id);
    if (start < 0) return;
    let end = start + 1;
    while (end < all.length && all[end].depth > all[start].depth) end++;
    const branch = all.slice(start, end),
      remaining = [...all.slice(0, start), ...all.slice(end)];
    const height = branch.reduce(
      (sum, r) =>
        sum +
        (list.current?.querySelector<HTMLElement>(
          '[data-category-id="' + CSS.escape(r.category.id) + '"]',
        )?.offsetHeight || 52),
      0,
    );
    publish({
      id,
      branch,
      remaining,
      height,
      x,
      y,
      keyboard,
      valid: true,
      ...projectCategoryGap(remaining, start, all[start].depth),
    });
    list.current?.focus({ preventScroll: true });
  }
  function update(x: number, y: number) {
    const d = active.current,
      p = pending.current,
      el = list.current;
    if (!d || !p || !el) return;
    const rect = el.getBoundingClientRect();
    let index = 0;
    for (const row of d.remaining) {
      const node = el.querySelector<HTMLElement>(
        '[data-category-id="' + CSS.escape(row.category.id) + '"]',
      );
      if (node && y >= rect.top + node.offsetTop + node.offsetHeight / 2)
        index++;
    }
    const projection = projectCategoryGap(
      d.remaining,
      index,
      p.depth + Math.round((x - p.x) / p.step),
    );
    publish({
      ...d,
      ...projection,
      x,
      y,
      valid:
        x >= rect.left - 24 &&
        x <= rect.right + 24 &&
        y >= rect.top - 32 &&
        y <= rect.bottom + 32,
    });
  }
  async function finish(save: boolean) {
    const d = active.current;
    pending.current = undefined;
    if (!d || finishing.current) return;
    finishing.current = true;
    if (save && d.valid) await latest.current.commit(d.id, d.drop);
    publish();
    finishing.current = false;
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLButtonElement>(
          '[data-grab="' + CSS.escape(d.id) + '"]',
        )
        ?.focus({ preventScroll: true }),
    );
  }
  useEffect(() => {
    let frame = 0;
    const move = (e: globalThis.PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      point.current = { x: e.clientX, y: e.clientY };
      if (!active.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5)
        begin(p.id, e.clientX, e.clientY, false);
      if (active.current) {
        e.preventDefault();
        update(e.clientX, e.clientY);
        if (!frame) frame = requestAnimationFrame(scroll);
      }
    };
    const up = () => {
      if (active.current && !active.current.keyboard) void finish(true);
      pending.current = undefined;
    };
    const cancel = () => {
      void finish(false);
      pending.current = undefined;
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && (active.current || pending.current)) {
        e.preventDefault();
        cancel();
      }
    };
    const scroll = () => {
      if (active.current && !active.current.keyboard && pending.current) {
        const y = point.current.y;
        const speed =
          y < 65
            ? -Math.ceil((65 - y) / 5)
            : y > innerHeight - 65
              ? Math.ceil((y - innerHeight + 65) / 5)
              : 0;
        if (speed) {
          window.scrollBy(0, speed);
          update(point.current.x, y);
        }
      }
      frame =
        active.current && !active.current.keyboard
          ? requestAnimationFrame(scroll)
          : 0;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  // Animate the displaced rows, without using animated bounds for hit testing.
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    list.current
      ?.querySelectorAll<HTMLElement>("[data-category-id]")
      .forEach((node) => {
        const id = node.dataset.categoryId!,
          top = node.offsetTop,
          old = previousRects.current.get(id);
        next.set(id, top);
        if (
          old !== undefined &&
          old !== top &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          node.getAnimations().forEach((a) => a.cancel());
          node.animate(
            [
              { transform: "translateY(" + (old - top) + "px)" },
              { transform: "translateY(0)" },
            ],
            { duration: 160, easing: "ease-out" },
          );
        }
      });
    previousRects.current = next;
  });
  function startPointer(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    const row = rows.find((r) => r.category.id === id);
    if (!row) return;
    pending.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      depth: row.depth,
      step:
        parseFloat(
          getComputedStyle(list.current!).getPropertyValue("--tree-indent"),
        ) || 48,
    };
    point.current = { x: e.clientX, y: e.clientY };
    list.current?.setPointerCapture(e.pointerId);
  }
  function startKeyboard(e: KeyboardEvent, id: string) {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    begin(id, 0, 0, true);
  }
  function keyboard(e: KeyboardEvent) {
    const d = active.current;
    if (!d?.keyboard) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void finish(true);
      return;
    }
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
      return;
    e.preventDefault();
    const index =
      d.index + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0);
    const depth =
      d.depth + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0);
    publish({ ...d, ...projectCategoryGap(d.remaining, index, depth) });
    requestAnimationFrame(() =>
      list.current
        ?.querySelector(".category-placeholder")
        ?.scrollIntoView({ block: "nearest" }),
    );
  }
  return { list, drag, startPointer, startKeyboard, keyboard };
}
