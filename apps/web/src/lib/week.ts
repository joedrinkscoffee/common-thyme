export type Ingredient = {
  name: string;
  perishable: boolean;
};

export type Dinner = {
  /** ISO date, e.g. "2026-11-23" */
  date: string;
  title: string;
  /** Placeholder tint until real photos are imported. */
  tint: string;
  ingredients: Ingredient[];
  sharedWithKids: boolean;
};

export type SharedIngredient = {
  name: string;
  /** ISO dates of the dinners that use it, in order. */
  dates: string[];
};

/**
 * Perishables used by two or more dinners in the week, most-shared first.
 * This is the overlap Chef optimizes for and the home page talks about.
 */
export function sharedPerishables(dinners: Dinner[]): SharedIngredient[] {
  const byName = new Map<string, { name: string; dates: Set<string> }>();
  for (const dinner of dinners) {
    for (const ing of dinner.ingredients) {
      if (!ing.perishable) continue;
      const key = ing.name.trim().toLowerCase();
      const entry = byName.get(key) ?? { name: ing.name.trim(), dates: new Set<string>() };
      entry.dates.add(dinner.date);
      byName.set(key, entry);
    }
  }
  return [...byName.values()]
    .filter((e) => e.dates.size > 1)
    .map((e) => ({ name: e.name, dates: [...e.dates].sort() }))
    .sort((a, b) => b.dates.length - a.dates.length || a.name.localeCompare(b.name));
}

/** Short weekday label for an ISO date, e.g. "MON". Dates are treated as local calendar days. */
export function weekdayLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
    .toUpperCase();
}

/** Servings for a dinner given household defaults. */
export function servingsFor(
  dinner: Pick<Dinner, "sharedWithKids">,
  settings: { baseServings: number; kidsExtraServings: number },
): number {
  return settings.baseServings + (dinner.sharedWithKids ? settings.kidsExtraServings : 0);
}
