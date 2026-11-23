/**
 * Everything the Chef home page shows, gathered in one place so the real
 * page and the sample preview render the same way.
 */
import { addDays, weekRangeLabel } from "./dates";
import { buildBrief, homeWeekStarts, weekLabel, type Brief, type HomeDinner, type HomeWeek } from "./brief";
import type { Choice } from "./session";
import type { ChefStore } from "./store";

export type HomeMessage = {
  id: string;
  role: "user" | "chef";
  author: string | null;
  body: string;
  choice: Choice | null;
  changes: string[];
  /** A check-in answer this message reports, which Undo reverses. */
  undo?: string | null;
  /** The week whose grocery list this message links to. */
  grocery?: string | null;
  at: string;
};

/** What /api/chef answers. */
export type ChefTurnResponse = { ok: true; reply: HomeMessage; changed: boolean } | { ok: false; error: string };

export type ChefHomeData = {
  connected: boolean;
  firstName: string | null;
  brief: Brief;
  weeks: HomeWeek[];
  messages: HomeMessage[];
  today: string;
};

export async function buildHome(opts: {
  store: ChefStore;
  today: string;
  hour: number;
  firstName: string | null;
  connected: boolean;
  messages: HomeMessage[];
  photoUrls: (recipeIds: string[]) => Promise<Map<string, string>>;
}): Promise<ChefHomeData> {
  const { store, today } = opts;
  const [thisStart, nextStart] = homeWeekStarts(today);
  const lastStart = addDays(thisStart, -7);
  const [catalog, plans, dinners] = await Promise.all([
    store.catalog(),
    store.plans(lastStart, nextStart),
    store.dinners(lastStart, addDays(nextStart, 6)),
  ]);
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const photos = await opts.photoUrls([...new Set(dinners.map((d) => d.recipeId))]);

  const week = (start: string): HomeWeek => ({
    weekStart: start,
    label: weekLabel(start, today),
    range: weekRangeLabel(start),
    status: plans.find((p) => p.weekStart === start)?.status ?? null,
    dinners: dinners
      .filter((d) => d.date >= start && d.date <= addDays(start, 6) && d.status !== "moved")
      .map(
        (d): HomeDinner => ({
          id: d.id,
          date: d.date,
          meal: d.meal,
          recipeId: d.recipeId,
          title: byId.get(d.recipeId)?.title ?? "A deleted recipe",
          photoUrl: photos.get(d.recipeId) ?? null,
          sharedWithKids: d.sharedWithKids,
          status: d.status,
          useUp: byId.get(d.recipeId)?.useUp ?? [],
        }),
      ),
  });

  const last = week(lastStart).dinners;
  const thisWeek = week(thisStart);
  const nextWeek = week(nextStart);
  const brief = buildBrief({
    today,
    hour: opts.hour,
    firstName: opts.firstName,
    thisWeek,
    nextWeek,
    lastWeek: last.length ? { cooked: last.filter((d) => d.status === "cooked").length, total: last.length } : null,
    recipeCount: catalog.length,
  });

  // Next week shows once it has dinners or it's time to plan it.
  const weeks = [thisWeek];
  if (nextWeek.dinners.length || brief.suggestions.includes("Plan next week")) weeks.push(nextWeek);

  return { connected: opts.connected, firstName: opts.firstName, brief, weeks, messages: opts.messages, today };
}
