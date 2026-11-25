import type { HomeDinner, HomeWeek } from "@/lib/chef/brief";
import { dayName, weekStartOf } from "@/lib/chef/dates";
import { DinnerMark } from "./dinner-mark";
import { MealPreview, MealPreviewLink } from "./meal-preview";

const TINTS = ["#f0b98a", "#9fcb8a", "#f2cf78", "#bfd48e", "#e7d3b0"];

function DinnerTile({ dinner, today, i, sample }: { dinner: HomeDinner; today: string; i: number; sample: boolean }) {
  const done = dinner.status === "cooked";
  const skipped = dinner.status === "skipped";
  const tonight = dinner.date === today && dinner.status === "planned";
  // Dinners this week (or earlier) can be marked; later weeks haven't happened yet.
  const markable = weekStartOf(dinner.date) <= weekStartOf(today) && dinner.status !== "moved";
  return (
    // One bordered card per meal: photo, a title clamped to two lines, and the Cooked
    // mark in a footer, so every card in a row is the same height and buttons line up.
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border-2 border-ink bg-paper text-ink transition-[translate,box-shadow] has-[a:hover]:-translate-x-0.5 has-[a:hover]:-translate-y-0.5 has-[a:hover]:shadow-pop motion-reduce:transition-none">
      <MealPreviewLink dinner={dinner} className="flex flex-1 flex-col text-ink no-underline">
        <div className={`relative aspect-square ${skipped ? "opacity-45 grayscale" : ""}`} style={{ background: TINTS[i % TINTS.length] }}>
          {dinner.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URLs from a private bucket
            <img src={dinner.photoUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {/* Stickers wrap instead of overlapping on narrow phone cards. */}
          <div className="absolute inset-x-2 top-2 flex flex-wrap items-start gap-1">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tonight ? "bg-tomato text-white" : "bg-ink text-cream"}`}>
              {tonight && dinner.meal === "dinner" ? "TONIGHT" : dayName(dinner.date, "short").toUpperCase()}
            </span>
            {dinner.sharedWithKids && (
              <span className="rotate-3 rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">+kids</span>
            )}
            {dinner.meal !== "dinner" && (
              <span className="rounded-full border-[1.5px] border-ink bg-cream px-2 py-0.5 text-[11px] font-extrabold">{dinner.meal}</span>
            )}
          </div>
          {done && (
            <span className="absolute bottom-2 left-2 -rotate-3 rounded-full border-[1.5px] border-ink bg-caper px-2 py-0.5 text-[11px] font-extrabold">
              ✓ cooked
            </span>
          )}
        </div>
        <div className="flex-1 px-2.5 pb-2 pt-2">
          {/* Always two lines tall; longer names end in an ellipsis (full name on hover and in the preview). */}
          <div
            title={dinner.title}
            className={`line-clamp-2 min-h-[2.5em] break-words font-display text-sm font-bold leading-tight group-has-[a:hover]:underline ${skipped ? "text-muted line-through" : ""}`}
          >
            {dinner.title}
          </div>
          {skipped && <div className="mt-0.5 text-[12px] text-muted">Skipped</div>}
        </div>
      </MealPreviewLink>
      {markable && (
        <div className="px-2 pb-2">
          <DinnerMark dinnerId={dinner.id} status={dinner.status as "planned" | "cooked" | "skipped"} title={dinner.title} sample={sample} />
        </div>
      )}
    </div>
  );
}

/** The week beside the chat: square dinner tiles, newest week below. */
export function WeekBoard({ weeks, today, sample = false }: { weeks: HomeWeek[]; today: string; sample?: boolean }) {
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
                <DinnerTile key={d.id} dinner={d} today={today} i={i} sample={sample} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-28 items-center justify-center rounded-2xl border-2 border-dashed border-dash p-4 text-center text-sm text-muted">
              Nothing planned yet. Ask Chef to plan it.
            </div>
          )}
        </section>
      ))}
      <p className="m-0 text-[13px] text-muted">Tap a meal to preview it, or just tell Chef what to change.</p>
      <MealPreview weeks={weeks} today={today} />
    </aside>
  );
}
