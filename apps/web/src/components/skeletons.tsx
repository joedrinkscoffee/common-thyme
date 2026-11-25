import { ChefAvatar } from "@/components/chef-avatar";

/**
 * Placeholder shapes shown while a page's data loads. Each one mirrors the
 * real layout (same widths, borders and grids) so nothing jumps when the
 * content arrives. The shimmer lives in globals.css (.skeleton) and stops for
 * people who prefer reduced motion.
 */

export function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const round = /(^|\s)rounded-/.test(className) ? "" : "rounded-full";
  return <span aria-hidden="true" className={`skeleton block ${round} ${className}`} style={style} />;
}

/** Wraps a skeleton so screen readers hear one short status instead of empty shapes. */
function Loading({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A square recipe card: photo, then a title line or two. */
function CardBone({ lines = 2 }: { lines?: 1 | 2 }) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-sand bg-paper">
      <Bone className="aspect-square rounded-none" />
      <div className="flex flex-col gap-1.5 px-2.5 pb-3 pt-2.5">
        <Bone className="h-3.5 w-[85%]" />
        {lines === 2 && <Bone className="h-3 w-[45%]" />}
      </div>
    </div>
  );
}

/* Chef home ------------------------------------------------------------- */

function BubbleBone({ widths }: { widths: number[] }) {
  return (
    <div className="flex w-[85%] max-w-[460px] flex-col gap-2 self-start rounded-[18px] rounded-bl-[4px] bg-sand/60 px-4 py-3.5">
      {widths.map((w, i) => (
        <Bone key={i} className="h-3.5" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export function ChefHomeSkeleton() {
  return (
    <Loading label="Chef is getting your week…" className="mx-auto flex w-full max-w-[1240px] flex-1 flex-wrap items-start gap-8 px-4 pb-6 sm:px-6">
      <section className="flex min-w-0 max-w-[720px] flex-[999_1_600px] flex-col overflow-hidden rounded-[28px] border-2 border-ink bg-paper h-[calc(100dvh-9.5rem)] min-h-[480px] sm:h-[calc(100dvh-7rem)] lg:sticky lg:top-4 lg:h-[calc(100dvh-6.5rem)]">
        <header className="flex flex-none items-center gap-3 border-b-2 border-line px-5 py-4 sm:px-6">
          <ChefAvatar size={44} />
          <div className="flex flex-col gap-1.5">
            <div className="font-display text-xl font-extrabold leading-tight">Chef</div>
            <Bone className="h-3 w-32" />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-5 sm:px-6">
          <BubbleBone widths={[55, 92, 78]} />
          <BubbleBone widths={[88, 64]} />
          <div className="flex w-[40%] max-w-[220px] self-end rounded-[18px] rounded-br-[4px] bg-sand/60 px-4 py-3.5">
            <Bone className="h-3.5 w-full" />
          </div>
          <BubbleBone widths={[70, 96, 50]} />
        </div>
        <footer className="flex-none border-t-2 border-line bg-cream/60 px-4 pb-4 pt-3 sm:px-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {[120, 150, 104].map((w) => (
              <Bone key={w} className="h-9" style={{ width: w }} />
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Bone className="h-[52px] w-[52px] flex-none" />
            <Bone className="h-[52px] flex-1 rounded-[26px]" />
          </div>
        </footer>
      </section>
      <aside className="flex min-w-[280px] flex-[1_1_360px] flex-col gap-7">
        {[3, 2].map((n, w) => (
          <div key={w}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <Bone className="h-3.5 w-24" />
              <Bone className="h-3 w-20" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: n }, (_, i) => (
                <CardBone key={i} lines={1} />
              ))}
            </div>
          </div>
        ))}
      </aside>
    </Loading>
  );
}

/* Recipes library ------------------------------------------------------- */

export function RecipeLibrarySkeleton() {
  return (
    <Loading label="Getting your recipes…">
      <Bone className="-mt-1 mb-4 h-4 w-24" />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Bone className="h-11 w-full sm:w-64" />
        <div className="flex flex-wrap gap-2">
          {[48, 76, 64, 88, 70].map((w, i) => (
            <Bone key={i} className="h-9" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <CardBone key={i} />
        ))}
      </div>
    </Loading>
  );
}

/* Groceries ------------------------------------------------------------- */

function GroceryRowBone({ w }: { w: number }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3.5 px-3 py-2.5">
      <Bone className="h-7 w-7 flex-none" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Bone className="h-4" style={{ width: `${w}%` }} />
        <Bone className="h-3 w-20" />
      </div>
    </div>
  );
}

export function GroceryListSkeleton() {
  return (
    <Loading label="Chef is writing your list…" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Bone className="h-3.5 w-44" />
          <Bone className="h-9 w-56" />
        </div>
        <div className="flex gap-1.5 rounded-full border-2 border-ink bg-paper p-1">
          <span className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-bold text-cream">This week</span>
          <span className="rounded-full px-3.5 py-1.5 text-sm font-bold text-ink">Next week</span>
        </div>
      </div>
      <div>
        <div className="h-4 rounded-full border-2 border-ink bg-paper" />
        <Bone className="mt-2 h-3.5 w-40" />
      </div>
      {[
        [62, 48, 70],
        [55, 40],
        [66, 52, 44],
      ].map((rows, s) => (
        <div key={s} className="rounded-[24px] border-2 border-ink bg-paper px-2 pb-2 pt-3">
          <div className="flex items-center gap-2 px-3 pb-1">
            <Bone className="h-6 w-6 flex-none" />
            <Bone className="h-5 w-32" />
            <Bone className="ml-auto h-3 w-8" />
          </div>
          {rows.map((w, i) => (
            <GroceryRowBone key={i} w={w} />
          ))}
        </div>
      ))}
    </Loading>
  );
}

/* What Chef knows ------------------------------------------------------- */

function PanelBone({ title, rows }: { title: string; rows: number[] }) {
  return (
    <section className="rounded-[24px] border-2 border-ink bg-paper p-5 sm:p-6">
      <h2 className="m-0 font-display text-xl font-extrabold">{title}</h2>
      <Bone className="mb-4 mt-2 h-3.5 w-[70%]" />
      <div className="flex flex-col gap-2">
        {rows.map((w, i) => (
          <div key={i} className="flex items-center gap-2 rounded-2xl bg-sand/60 px-4 py-3">
            <Bone className="h-5 w-14 flex-none" />
            <Bone className="h-3.5" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ChefKnowsSkeleton() {
  return (
    <Loading label="Getting what Chef knows…" className="grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <PanelBone title="Your calendar" rows={[50, 38]} />
      </div>
      <PanelBone title="You said" rows={[62, 48, 70]} />
      <PanelBone title="Chef noticed" rows={[58, 44]} />
    </Loading>
  );
}

/* Single recipe --------------------------------------------------------- */

/** Ingredient and step lines, shared by the recipe page and the Chef page's slide-out preview. */
export function RecipeBodyBones({ compact = false }: { compact?: boolean }) {
  const heading = compact ? "mb-3 mt-0 h-5 w-28" : "mb-4 mt-8 h-6 w-36";
  return (
    <>
      <Bone className={heading} />
      <div className="flex flex-col gap-3">
        {[64, 48, 72, 40, 56, 66].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <Bone className="h-2.5 w-2.5 flex-none" />
            <Bone className="h-3.5" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <Bone className={compact ? "mb-3 mt-7 h-5 w-20" : "mb-4 mt-8 h-6 w-24"} />
      <div className="flex flex-col gap-4">
        {[3, 2, 3].map((lines, i) => (
          <div key={i} className="flex gap-3">
            <Bone className="h-8 w-8 flex-none" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              {Array.from({ length: lines }, (_, j) => (
                <Bone key={j} className="h-3.5" style={{ width: j === lines - 1 ? "60%" : "100%" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function RecipeSkeleton() {
  return (
    <Loading label="Getting the recipe…" className="flex flex-wrap items-start gap-8">
      <div className="min-w-[260px] flex-[1_1_380px]">
        <Bone className="aspect-square rounded-[22px]" />
      </div>
      <div className="min-w-0 flex-[2_1_480px]">
        <div className="flex gap-2">
          <Bone className="h-5 w-16" />
          <Bone className="h-5 w-20" />
        </div>
        <Bone className="mb-3 mt-4 h-9 w-[80%]" />
        <Bone className="h-4 w-48" />
        <RecipeBodyBones />
      </div>
    </Loading>
  );
}
