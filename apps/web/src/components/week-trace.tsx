"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ProduceStickerButton, stickerColor } from "./produce-sticker";

type Point = { x: number; y: number };

/**
 * A week's meal cards with the ingredients they share shown as produce stickers.
 * Tap a sticker to trace it: meals that don't use it fade, and a dotted string
 * joins the ones that do. Tap it again to clear.
 */
export function WeekTrace({
  shared,
  uses,
  children,
}: {
  /** Ingredients used by more than one meal this week, with how many meals use each. */
  shared: { name: string; n: number }[];
  /** For each card (same order as children), the ingredients it uses up. */
  uses: string[][];
  children: ReactNode[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const grid = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  // Only trace an ingredient that's still on this week (the plan can change under us).
  const active = picked && shared.some((s) => s.name === picked) ? picked : null;

  // Where the string goes: the middle of each traced card's photo, recomputed when the layout changes.
  useLayoutEffect(() => {
    const box = grid.current;
    if (!active || !box) return;
    const measure = () => {
      const origin = box.getBoundingClientRect();
      setPoints(
        cells.current.flatMap((el, i) => {
          if (!el || !uses[i]?.includes(active)) return [];
          const r = el.getBoundingClientRect();
          return [{ x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.width * 0.5 }];
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [active, uses]);

  const path = points.map((p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const a = points[i - 1];
    // A gentle sag between cards, like string pinned at both ends.
    const sag = 18 + Math.abs(p.x - a.x) * 0.12;
    return `C${a.x} ${a.y + sag} ${p.x} ${p.y + sag} ${p.x} ${p.y}`;
  });

  return (
    <div className="flex flex-col gap-3">
      {shared.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Shared ingredients this week">
          {shared.map((s) => (
            <ProduceStickerButton
              key={s.name}
              name={s.name}
              note={`×${s.n}`}
              aria-pressed={active === s.name}
              title={active === s.name ? "Show all meals" : `Show the meals that use ${s.name}`}
              onClick={() => setPicked(active === s.name ? null : s.name)}
              className="text-[13px]"
            />
          ))}
        </div>
      )}
      <div ref={grid} className="relative grid grid-cols-3 gap-3">
        {children.map((child, i) => {
          const off = active !== null && !uses[i]?.includes(active);
          return (
            <div
              key={i}
              ref={(el) => {
                cells.current[i] = el;
              }}
              className={`transition-opacity duration-200 motion-reduce:transition-none ${off ? "opacity-35" : ""}`}
            >
              {child}
            </div>
          );
        })}
        {active && points.length > 1 && (
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible">
            <path d={path.join(" ")} fill="none" stroke="#d6a800" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="6" fill={stickerColor(active)} stroke="var(--color-ink)" strokeWidth="2" />
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
