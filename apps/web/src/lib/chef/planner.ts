/**
 * The overlap engine. Picks a week of dinners that share the ingredients
 * worth using up (fresh vegetables, pricey condiments and cheeses, protein
 * packs), so what you buy on Sunday gets used up by Friday. Pantry items
 * like capers count a little; cheap staples like lemons don't count. Pricey
 * long keepers like walnuts get credit when a recent week already opened them. Chef calls
 * this through its plan_week tool and explains the result; the maths lives
 * here so it is fast, free and testable.
 */
import { KID_FRIENDLY_TAG } from "../recipe-edit";

export type CatalogRecipe = {
  id: string;
  title: string;
  tags: string[];
  totalMinutes: number | null;
  /** Ingredients worth planning around, lowercase base names, e.g. ["kale", "chicken breast"]. */
  useUp: string[];
  /** Ingredients worth finishing but only as a tiebreaker, e.g. ["caper"]. */
  pantry?: string[];
  /** Pricey ingredients that keep for months, finished over several weeks, e.g. ["walnut"]. */
  stockUp?: string[];
};

export type PlanRequest = {
  catalog: CatalogRecipe[];
  /** The nights to fill, in order. */
  dates: string[];
  /** How many of those dinners the kids share. */
  kidNights: number;
  /** Recipes that must be in the week (fills nights first). */
  keep?: string[];
  /** Recipes to leave out entirely. */
  avoid?: string[];
  /** Recipes cooked or planned recently; skipped unless there aren't enough others. */
  recent?: string[];
  /** Stock-up ingredients already bought for recent weeks, so reusing them is a plus. */
  opened?: string[];
  /** Any number; a different seed gives a different but equally good week. */
  seed?: number;
};

export type PlannedNight = { date: string; recipeId: string; sharedWithKids: boolean };

export type PlanResult = {
  nights: PlannedNight[];
  /** Use-up ingredients on two or more nights, most-shared first. */
  shared: { name: string; nights: number }[];
  /** Use-up ingredients bought for one night only. */
  singles: string[];
  /** Pantry items on two or more nights. */
  pantryShared: { name: string; nights: number }[];
  /** Stock-up ingredients this week uses again after a recent week opened them. */
  stockUpReused: string[];
  /** True when there weren't enough kid friendly recipes for every kid night. */
  shortOnKidFriendly: boolean;
};

export const isKidFriendly = (r: Pick<CatalogRecipe, "tags">) => r.tags.some((t) => t.toLowerCase() === KID_FRIENDLY_TAG);

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function counts(recipes: CatalogRecipe[], pick: (r: CatalogRecipe) => string[] = (r) => r.useUp): Map<string, number> {
  const c = new Map<string, number>();
  for (const r of recipes) for (const p of new Set(pick(r))) c.set(p, (c.get(p) ?? 0) + 1);
  return c;
}

/**
 * Higher is better. A use-up ingredient on a second or third night earns 3,
 * and one bought for a single night costs 1. Pantry items earn 1 per extra
 * night and cost nothing, so they only tip close calls. Stock-up items earn 1
 * per extra night too, and 2 when a recent week already opened them.
 */
export function overlapScore(recipes: CatalogRecipe[], opened: ReadonlySet<string> = new Set()): number {
  let score = 0;
  for (const n of counts(recipes).values()) score += n >= 2 ? (n - 1) * 3 : -1;
  for (const n of counts(recipes, (r) => r.pantry ?? []).values()) if (n >= 2) score += n - 1;
  for (const [name, n] of counts(recipes, (r) => r.stockUp ?? [])) score += (n - 1) + (opened.has(name) ? 2 : 0);
  return score;
}

const sharedList = (c: Map<string, number>) =>
  [...c.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, nights]) => ({ name, nights }));

function summarize(recipes: CatalogRecipe[], opened: ReadonlySet<string>) {
  const c = counts(recipes);
  const singles = [...c.entries()].filter(([, n]) => n === 1).map(([name]) => name).sort();
  const stockUpReused = [...counts(recipes, (r) => r.stockUp ?? []).keys()].filter((name) => opened.has(name)).sort();
  return { shared: sharedList(c), singles, pantryShared: sharedList(counts(recipes, (r) => r.pantry ?? [])), stockUpReused };
}

/** Orders the picks so dinners that share ingredients sit close together. */
function order(picks: CatalogRecipe[], random: () => number): CatalogRecipe[] {
  if (picks.length <= 1) return picks;
  const c = counts(picks);
  const sharedness = (r: CatalogRecipe) => r.useUp.reduce((s, p) => s + ((c.get(p) ?? 0) > 1 ? 1 : 0), 0);
  const left = [...picks];
  // Start with the dinner using the most short-lived shared produce.
  left.sort((a, b) => sharedness(b) - sharedness(a) || b.useUp.length - a.useUp.length || random() - 0.5);
  const out = [left.shift()!];
  while (left.length) {
    const last = out[out.length - 1];
    const lastSet = new Set(last.useUp);
    let best = 0;
    let bestScore = -Infinity;
    left.forEach((r, i) => {
      const overlap = r.useUp.filter((p) => lastSet.has(p)).length;
      const pantryOverlap = (r.pantry ?? []).filter((p) => (last.pantry ?? []).includes(p)).length;
      const s = overlap * 10 + pantryOverlap * 2 + sharedness(r) + random() * 0.5;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}

export function planWeek(req: PlanRequest): PlanResult {
  const n = req.dates.length;
  const byId = new Map(req.catalog.map((r) => [r.id, r]));
  const avoid = new Set(req.avoid ?? []);
  const keep = [...new Set(req.keep ?? [])].filter((id) => byId.has(id) && !avoid.has(id)).slice(0, n);
  const recent = new Set(req.recent ?? []);
  const kidNights = Math.max(0, Math.min(req.kidNights, n));
  const opened = new Set(req.opened ?? []);

  let pool = req.catalog.filter((r) => !avoid.has(r.id) && !keep.includes(r.id) && !recent.has(r.id));
  // Not enough fresh recipes: let recent ones back in rather than leave nights empty.
  if (pool.length < (n - keep.length) * 2) pool = req.catalog.filter((r) => !avoid.has(r.id) && !keep.includes(r.id));

  const kept = keep.map((id) => byId.get(id)!);
  const need = n - kept.length;
  const kidAvailable = kept.filter(isKidFriendly).length + pool.filter(isKidFriendly).length;
  const kidTarget = Math.min(kidNights, kidAvailable);

  let best: CatalogRecipe[] = kept;
  let bestScore = -Infinity;
  const restarts = Math.max(8, Math.min(48, pool.length));
  for (let t = 0; t < restarts && need > 0; t++) {
    const random = rng((req.seed ?? 1) * 7919 + t * 104729);
    const picks = [...kept];
    const left = [...pool];
    while (picks.length < n && left.length) {
      const kidsSoFar = picks.filter(isKidFriendly).length;
      const slots = n - picks.length;
      const mustBeKid = kidTarget - kidsSoFar >= slots;
      const base = overlapScore(picks, opened);
      let bestI = -1;
      let bestGain = -Infinity;
      left.forEach((r, i) => {
        if (mustBeKid && !isKidFriendly(r)) return;
        // The first free pick is mostly random, so restarts explore different weeks.
        const jitter = picks.length === kept.length ? random() * 6 : random() * 1.5;
        const gain = overlapScore([...picks, r], opened) - base + jitter + (isKidFriendly(r) && kidsSoFar < kidTarget ? 1 : 0);
        if (gain > bestGain) {
          bestGain = gain;
          bestI = i;
        }
      });
      if (bestI < 0) break;
      picks.push(left.splice(bestI, 1)[0]);
    }
    const kidOk = picks.filter(isKidFriendly).length >= kidTarget;
    const score = overlapScore(picks, opened) + (kidOk ? 0 : -100) + random() * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = picks;
    }
  }

  const ordered = order(best, rng((req.seed ?? 1) + 31));
  // Kids share the kid friendly dinners first, then whatever is left.
  const kidIds = new Set<string>();
  for (const r of ordered) if (kidIds.size < kidNights && isKidFriendly(r)) kidIds.add(r.id);
  for (const r of [...ordered].reverse()) if (kidIds.size < kidNights) kidIds.add(r.id);

  const { shared, singles, pantryShared, stockUpReused } = summarize(ordered, opened);
  return {
    nights: ordered.map((r, i) => ({ date: req.dates[i], recipeId: r.id, sharedWithKids: kidIds.has(r.id) })),
    shared,
    singles,
    pantryShared,
    stockUpReused,
    shortOnKidFriendly: kidAvailable < kidNights,
  };
}
