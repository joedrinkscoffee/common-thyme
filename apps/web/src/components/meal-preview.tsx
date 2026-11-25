"use client";

/**
 * A recipe preview that slides in over the Chef page, so a drafted week can be
 * reviewed meal by meal without leaving it. The open meal lives in the URL
 * (?meal=<id>), so the back button closes it and a link reopens it.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadRecipePreview, type RecipePreview } from "@/app/preview-actions";
import { RecipeBodyBones } from "@/components/skeletons";
import type { HomeDinner, HomeWeek } from "@/lib/chef/brief";
import { dayName } from "@/lib/chef/dates";
import { sharedFor, sharedWithWeek, type SharedIngredient } from "@/lib/chef/shared-with";
import { IngredientText } from "./ingredient-text";

const PARAM = "meal";

// One request per recipe per visit; hovering a tile starts it early.
const cache = new Map<string, Promise<RecipePreview | null>>();
function fetchPreview(recipeId: string) {
  let p = cache.get(recipeId);
  if (!p) {
    p = loadRecipePreview(recipeId).catch(() => {
      cache.delete(recipeId);
      return null;
    });
    cache.set(recipeId, p);
  }
  return p;
}

function urlWith(mealId: string | null) {
  const url = new URL(window.location.href);
  if (mealId) url.searchParams.set(PARAM, mealId);
  else url.searchParams.delete(PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Opens a meal's preview. Pushes a history entry the first time, so Back closes it. */
function openMeal(mealId: string) {
  const state = window.history.state as { mealPreview?: boolean } | null;
  if (state?.mealPreview) window.history.replaceState({ ...state }, "", urlWith(mealId));
  else window.history.pushState({ mealPreview: true }, "", urlWith(mealId));
}

function closeMeal() {
  const state = window.history.state as { mealPreview?: boolean } | null;
  if (state?.mealPreview) window.history.back();
  else window.history.replaceState(null, "", urlWith(null));
}

/**
 * A meal tile's link. A plain click or tap opens the preview; Cmd/Ctrl-click,
 * middle-click and no-JS still go to the full recipe page.
 */
export function MealPreviewLink({ dinner, className, children }: { dinner: HomeDinner; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void fetchPreview(dinner.recipeId);
    openMeal(dinner.id);
  };
  const warm = () => void fetchPreview(dinner.recipeId);
  return (
    <Link
      href={`/recipes/${dinner.recipeId}`}
      prefetch={false}
      onClick={onClick}
      onPointerEnter={warm}
      onFocus={warm}
      aria-haspopup="dialog"
      className={className}
    >
      {children}
    </Link>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function dayLabel(d: HomeDinner, today: string) {
  const meal = d.meal === "dinner" ? "" : ` ${d.meal}`;
  if (d.date === today && d.status === "planned") return d.meal === "dinner" ? "Tonight" : `Today's${meal}`;
  return `${dayName(d.date)}${meal}`;
}

const shortDay = (d: HomeDinner) => dayName(d.date, "short");

function NavButton({ dinner, dir, onGo }: { dinner: HomeDinner | undefined; dir: "prev" | "next"; onGo: (d: HomeDinner) => void }) {
  if (!dinner) return <span className="w-[76px]" aria-hidden="true" />;
  return (
    <button
      type="button"
      onClick={() => onGo(dinner)}
      aria-label={`${dir === "prev" ? "Previous" : "Next"} meal: ${dayName(dinner.date)}, ${dinner.title}`}
      className="w-[76px] flex-none rounded-full border-2 border-ink bg-paper px-3 py-2 text-sm font-bold text-ink transition-[background-color,translate,box-shadow] hover:-translate-x-px hover:-translate-y-px hover:bg-lemon hover:shadow-pop-sm motion-reduce:transition-none"
    >
      {dir === "prev" ? `‹ ${shortDay(dinner)}` : `${shortDay(dinner)} ›`}
    </button>
  );
}

function SharedSticker({ shared }: { shared: SharedIngredient }) {
  return (
    <span className="ml-1.5 inline-block -rotate-2 whitespace-nowrap rounded-full border-[1.5px] border-ink bg-lemon px-1.5 py-px align-[1px] text-[11px] font-extrabold">
      also {shared.with.map(shortDay).join(", ")}
    </span>
  );
}

function Body({ recipe, shared }: { recipe: RecipePreview | null | "loading"; shared: SharedIngredient[] }) {
  if (recipe === "loading") {
    return (
      <div role="status" aria-busy="true" className="pt-2">
        <span className="sr-only">Getting the recipe…</span>
        <RecipeBodyBones compact />
      </div>
    );
  }
  if (!recipe) return <p className="text-muted">Couldn&apos;t load this recipe. Open the full recipe to try again.</p>;
  return (
    <>
      {recipe.deleted && <p className="mb-4 rounded-xl bg-sand px-3 py-2 text-sm">This recipe was deleted from your library.</p>}
      <h3 className="mb-2.5 mt-0 font-display text-xl font-extrabold">Ingredients</h3>
      {recipe.ingredients.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {recipe.ingredients.map((i, n) => {
            const s = sharedFor(i.name, i.raw, shared);
            return (
              <li key={n} className="flex items-start gap-2 leading-relaxed">
                <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 flex-none rounded-full border-[1.5px] border-ink ${i.perishable ? "bg-kale" : "bg-paper"}`} />
                <span>
                  <IngredientText line={i} />
                  {s && <SharedSticker shared={s} />}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted">No ingredients saved yet.</p>
      )}

      <h3 className="mb-3 mt-7 font-display text-xl font-extrabold">Steps</h3>
      {recipe.steps.length ? (
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {recipe.steps.map((s, n) => (
            <li key={n} className="flex gap-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-tomato text-sm font-bold text-white">{n + 1}</span>
              <div className="leading-relaxed">
                {s.title && <div className="font-display font-extrabold">{s.title}</div>}
                <p className="m-0 whitespace-pre-line">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted">No steps saved yet.</p>
      )}
      {recipe.notes && <p className="mt-6 whitespace-pre-line rounded-xl bg-sand px-4 py-3 text-sm">{recipe.notes}</p>}
    </>
  );
}

function findMeal(weeks: HomeWeek[], mealId: string | null) {
  for (const week of weeks) {
    const i = week.dinners.findIndex((d) => d.id === mealId);
    if (i >= 0) return { week, i, dinner: week.dinners[i] };
  }
  return null;
}

/** The slide-out itself. Right-hand panel on wider screens, a full-screen sheet on phones. */
export function MealPreview({ weeks, today }: { weeks: HomeWeek[]; today: string }) {
  const mealId = useSearchParams().get(PARAM);
  const found = findMeal(weeks, mealId);
  const dinner = found?.dinner ?? null;

  const ref = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{ id: string; recipe: RecipePreview | null } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (dinner && !d.open) d.showModal();
    if (!dinner && d.open) d.close();
  }, [dinner]);

  useEffect(() => {
    if (!dinner) return;
    let live = true;
    scroller.current?.scrollTo({ top: 0 });
    fetchPreview(dinner.recipeId).then((recipe) => live && setLoaded({ id: dinner.recipeId, recipe }));
    return () => {
      live = false;
    };
  }, [dinner]);

  const go = useCallback((d: HomeDinner) => {
    void fetchPreview(d.recipeId);
    openMeal(d.id);
  }, []);

  const prev = found ? found.week.dinners[found.i - 1] : undefined;
  const next = found ? found.week.dinners[found.i + 1] : undefined;

  // Warm the neighbours so stepping through the week feels instant.
  useEffect(() => {
    if (prev) void fetchPreview(prev.recipeId);
    if (next) void fetchPreview(next.recipeId);
  }, [prev, next]);

  useEffect(() => {
    if (!dinner) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowLeft" && prev) go(prev);
      if (e.key === "ArrowRight" && next) go(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dinner, prev, next, go]);

  const shared = found ? sharedWithWeek(found.dinner, found.week.dinners) : [];
  const recipe = dinner && loaded?.id === dinner.recipeId ? loaded.recipe : "loading";
  const meta = recipe !== "loading" && recipe ? recipe : null;
  const photo = meta?.photoUrl ?? dinner?.photoUrl ?? null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="meal-preview-title"
      onCancel={(e) => {
        e.preventDefault();
        closeMeal();
      }}
      onClick={(e) => {
        // A click on the dimmed backdrop lands on the dialog itself.
        if (e.target === e.currentTarget) closeMeal();
      }}
      className="meal-preview fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-cream p-0 text-ink sm:left-auto sm:right-0 sm:w-[min(500px,100vw)] sm:border-l-2 sm:border-ink"
    >
      {dinner && (
        <div className="flex h-full flex-col">
          <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="relative aspect-[3/2] w-full flex-none border-b-2 border-ink bg-sand">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
                <img src={photo} alt={`Photo of ${dinner.title}`} className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute left-3 top-3 flex gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${dayLabel(dinner, today) === "Tonight" ? "bg-tomato text-white" : "bg-ink text-cream"}`}>
                  {dayLabel(dinner, today).toUpperCase()}
                </span>
                {dinner.sharedWithKids && (
                  <span className="rotate-3 rounded-full border-[1.5px] border-ink bg-lemon px-2.5 py-1 text-[12px] font-extrabold">+kids</span>
                )}
                {dinner.status === "cooked" && (
                  <span className="-rotate-3 rounded-full border-[1.5px] border-ink bg-caper px-2.5 py-1 text-[12px] font-extrabold">✓ cooked</span>
                )}
              </div>
              <button
                type="button"
                onClick={closeMeal}
                aria-label="Close preview"
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-paper text-xl font-bold leading-none text-ink transition-[background-color,translate,box-shadow] hover:-translate-x-px hover:-translate-y-px hover:bg-lemon hover:shadow-pop-sm motion-reduce:transition-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 pb-8 pt-4">
              <p className="m-0 text-[12px] font-bold tracking-[0.08em] text-muted">
                {found?.week.label.toUpperCase()}
                {found && found.week.dinners.length > 1 ? ` · ${found.i + 1} OF ${found.week.dinners.length}` : ""}
              </p>
              <h2 id="meal-preview-title" className="mb-1.5 mt-1 font-display text-3xl font-extrabold leading-none tracking-tight">
                {dinner.title}
              </h2>
              {meta && (
                <p className="m-0 text-sm text-muted">
                  Serves {meta.servings}
                  {meta.totalMinutes ? ` · ${meta.totalMinutes} min` : ""}
                  {meta.sourceUrl && (
                    <>
                      {" · "}
                      <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="text-ink underline">
                        {hostOf(meta.sourceUrl)}
                      </a>
                    </>
                  )}
                </p>
              )}
              {shared.length > 0 && (
                <p className="mb-0 mt-3 rounded-xl border-2 border-dashed border-dash px-3 py-2 text-sm leading-relaxed">
                  <span className="font-bold">Shares with this week: </span>
                  {shared.map((s, n) => (
                    <span key={s.key}>
                      {n > 0 && ", "}
                      {s.key} ({s.with.map(shortDay).join(", ")})
                    </span>
                  ))}
                </p>
              )}
              <div className="mt-6">
                <Body recipe={recipe} shared={shared} />
              </div>
            </div>
          </div>

          <div className="flex flex-none items-center justify-between gap-2 border-t-2 border-ink bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <NavButton dinner={prev} dir="prev" onGo={go} />
            <Link
              href={`/recipes/${dinner.recipeId}`}
              className="rounded-full border-2 border-ink bg-tomato px-4 py-2 text-center text-sm font-bold text-white no-underline transition-[background-color,translate,box-shadow] hover:-translate-x-px hover:-translate-y-px hover:bg-tomato-dark hover:shadow-pop-sm motion-reduce:transition-none"
            >
              Open full recipe
            </Link>
            <NavButton dinner={next} dir="next" onGo={go} />
          </div>
        </div>
      )}
    </dialog>
  );
}
