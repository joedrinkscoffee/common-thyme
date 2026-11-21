import Link from "next/link";
import type { HomeDinner, HomeWeek } from "@/lib/chef/brief";
import { dayName } from "@/lib/chef/dates";

const TINTS = ["#f0b98a", "#9fcb8a", "#f2cf78", "#bfd48e", "#e7d3b0"];

function DinnerTile({ dinner, today, i }: { dinner: HomeDinner; today: string; i: number }) {
  const done = dinner.status === "cooked";
  const skipped = dinner.status === "skipped";
  const tonight = dinner.date === today && dinner.status === "planned";
  return (
    <Link
      href={`/recipes/${dinner.recipeId}`}
      className="group block overflow-hidden rounded-2xl border-2 border-ink bg-paper text-ink no-underline transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-pop motion-reduce:transition-none"
    >
      <div className={`relative aspect-square ${skipped ? "opacity-45 grayscale" : ""}`} style={{ background: TINTS[i % TINTS.length] }}>
        {dinner.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URLs from a private bucket
          <img src={dinner.photoUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${tonight ? "bg-tomato text-white" : "bg-ink text-cream"}`}>
          {tonight ? "TONIGHT" : dayName(dinner.date, "short").toUpperCase()}
        </span>
        {dinner.sharedWithKids && (
          <span className="absolute right-2 top-2 rotate-3 rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">
            +kids
          </span>
        )}
        {done && (
          <span className="absolute bottom-2 left-2 -rotate-3 rounded-full border-[1.5px] border-ink bg-caper px-2 py-0.5 text-[11px] font-extrabold">
            ✓ cooked
          </span>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2">
        <div className={`font-display text-sm font-bold leading-tight group-hover:underline ${skipped ? "text-muted line-through" : ""}`}>{dinner.title}</div>
        {skipped && <div className="mt-0.5 text-[12px] text-muted">Skipped</div>}
      </div>
    </Link>
  );
}

/** The week beside the chat: square dinner tiles, newest week below. */
export function WeekBoard({ weeks, today }: { weeks: HomeWeek[]; today: string }) {
  return (
    <aside aria-label="Your weeks" className="flex min-w-[280px] flex-[1_1_360px] flex-col gap-7">
      {weeks.map((w) => (
        <section key={w.weekStart} aria-label={w.label}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[13px] font-bold tracking-[0.08em] text-muted">
              {w.label.toUpperCase()}
              {w.dinners.length > 0 && (w.status === "approved" ? " · LOCKED IN" : " · DRAFT")}
            </h2>
            <span className="text-[13px] text-muted">{w.range}</span>
          </div>
          {w.dinners.length ? (
            <div className="grid grid-cols-3 gap-3">
              {w.dinners.map((d, i) => (
                <DinnerTile key={d.id} dinner={d} today={today} i={i} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-28 items-center justify-center rounded-2xl border-2 border-dashed border-dash p-4 text-center text-sm text-muted">
              Nothing planned yet. Ask Chef to plan it.
            </div>
          )}
        </section>
      ))}
      <p className="m-0 text-[13px] text-muted">Tap a dinner for the recipe, or just tell Chef what to change.</p>
    </aside>
  );
}
