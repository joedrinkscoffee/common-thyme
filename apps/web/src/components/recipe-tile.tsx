import { weekdayLabel, type Dinner } from "@/lib/week";

export function RecipeTile({ dinner }: { dinner: Dinner }) {
  return (
    <article className="overflow-hidden rounded-2xl border-2 border-ink bg-paper">
      <div className="relative aspect-square" style={{ background: dinner.tint }} role="img" aria-label={`Photo of ${dinner.title}`}>
        <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">
          {weekdayLabel(dinner.date)}
        </span>
        {dinner.sharedWithKids && (
          <span className="absolute bottom-2 right-2 rotate-3 rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">
            +kids
          </span>
        )}
      </div>
      <div className="px-2.5 pb-2.5 pt-2 font-display text-sm font-bold leading-tight">{dinner.title}</div>
    </article>
  );
}
