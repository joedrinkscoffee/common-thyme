/**
 * Which of a meal's "use up" ingredients the rest of its week also uses, so the
 * preview can say why Chef paired them ("spinach · also Wed").
 */
import { matchKey } from "../ingredient-line";
import type { HomeDinner } from "./brief";

export type SharedIngredient = { key: string; with: HomeDinner[] };

/** The meal's use-up ingredients that other meals in the same week share, in the meal's own order. */
export function sharedWithWeek(dinner: HomeDinner, week: HomeDinner[]): SharedIngredient[] {
  const others = week.filter((d) => d.id !== dinner.id && d.status !== "skipped");
  const out: SharedIngredient[] = [];
  for (const key of new Set(dinner.useUp.map(matchKey))) {
    const withMeals = others.filter((d) => d.useUp.some((k) => matchKey(k) === key));
    if (withMeals.length) out.push({ key, with: withMeals });
  }
  return out;
}

/** The shared ingredient an ingredient line is, if any: "baby spinach" is spinach, "spinach" is spinach. */
export function sharedFor(lineName: string | null, raw: string, shared: SharedIngredient[]): SharedIngredient | null {
  const key = matchKey(lineName ?? raw);
  return (
    shared.find(({ key: k }) => key === k || key.startsWith(`${k} `) || key.endsWith(` ${k}`) || key.includes(` ${k} `)) ?? null
  );
}
