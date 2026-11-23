import { addDays, isIsoDate, weekStartOf, weekdayIndex } from "../chef/dates";

/**
 * Which week's list to open. Late in the week (Thursday on) you're shopping
 * for next week, so that's the default once it has meals; earlier, it's this
 * week's list.
 */
export function defaultGroceryWeek(today: string, hasMeals: (weekStart: string) => boolean): string {
  const thisWeek = weekStartOf(today);
  const nextWeek = addDays(thisWeek, 7);
  const late = weekdayIndex(today) >= 3;
  if (late && hasMeals(nextWeek)) return nextWeek;
  if (hasMeals(thisWeek)) return thisWeek;
  return hasMeals(nextWeek) ? nextWeek : thisWeek;
}

/** The week asked for in the address, if it's this week or the next. */
export function groceryWeekParam(param: unknown, today: string): string | null {
  if (!isIsoDate(param)) return null;
  const w = weekStartOf(param);
  const thisWeek = weekStartOf(today);
  return w === thisWeek || w === addDays(thisWeek, 7) ? w : null;
}
