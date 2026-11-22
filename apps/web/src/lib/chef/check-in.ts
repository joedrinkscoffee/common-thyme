/**
 * Check-ins: what happened to a planned dinner. Used by the dinner tiles, the
 * check-in on Chef's home and the one-tap links in reminder emails, so all
 * three behave the same. Written in code, not by the model.
 *
 * A dinner belongs to one week's plan, so "cooked" counts for that week only.
 */
import { addDays, dayName, shortDate, weekDates, weekStartOf } from "./dates";
import type { ChefStore, StoredDinner } from "./store";

export type CheckInAction = "cooked" | "later" | "next_week" | "skip";
export const CHECK_IN_ACTIONS: CheckInAction[] = ["cooked", "later", "next_week", "skip"];

export const ACTION_LABEL: Record<CheckInAction, string> = {
  cooked: "Cooked",
  later: "Later this week",
  next_week: "Push to next week",
  skip: "Skip",
};

/** After this many pushes, a dinner goes back to the recipe library instead of rolling again. */
export const MAX_PUSHES = 2;

export type CheckInResult =
  | {
      ok: true;
      /** What Chef says, e.g. "Marked Chicken Piccata cooked." */
      text: string;
      /** The short change sticker, e.g. "Marked Chicken Piccata cooked". */
      change: string;
      /** The dinner to pass to undoCheckIn. */
      undo: string;
    }
  | { ok: false; error: string };

const isLive = (d: StoredDinner) => d.status === "planned" || d.status === "cooked";

async function recipeTitle(store: ChefStore, recipeId: string) {
  return (await store.recipe(recipeId))?.title ?? "That dinner";
}

/** The first night from `from` through `to` with no planned or cooked dinner. */
async function firstOpenNight(store: ChefStore, from: string, to: string): Promise<string | null> {
  if (from > to) return null;
  const taken = new Set((await store.dinners(from, to)).filter(isLive).map((d) => d.date));
  for (let day = from; day <= to; day = addDays(day, 1)) if (!taken.has(day)) return day;
  return null;
}

async function moveTo(store: ChefStore, d: StoredDinner, date: string, pushed: boolean) {
  const plan = await store.ensurePlan(weekStartOf(date));
  const added = await store.addDinner({
    planId: plan.id,
    date,
    recipeId: d.recipeId,
    sharedWithKids: d.sharedWithKids,
    servings: d.servings,
    pushCount: d.pushCount + (pushed ? 1 : 0),
  });
  await store.updateDinner(d.id, { status: "moved", movedTo: added.id });
  return added;
}

/**
 * Pushes a dinner into the week starting `weekStart`, on its earliest open
 * night (the fresh things were likely bought already, so cook it early).
 * A dinner already pushed twice goes back to the library instead.
 */
async function push(store: ChefStore, d: StoredDinner, weekStart: string, today: string, title: string): Promise<CheckInResult> {
  if (d.pushCount >= MAX_PUSHES) {
    await store.updateDinner(d.id, { status: "skipped" });
    return {
      ok: true,
      text: `${title} has been pushed twice already, so I put it back in your recipes instead of rolling it again.`,
      change: `Put ${title} back in your recipes`,
      undo: d.id,
    };
  }
  const from = weekStart > today ? weekStart : today;
  const night = await firstOpenNight(store, from, addDays(weekStart, 6));
  if (!night) return { ok: false, error: `The week of ${shortDate(weekStart)} is full. Ask Chef to make room?` };
  await moveTo(store, d, night, true);
  return {
    ok: true,
    text: `Pushed ${title} to ${dayName(night)}, ${shortDate(night)}.`,
    change: `Pushed ${title} to ${dayName(night, "short")}, ${shortDate(night)}`,
    undo: d.id,
  };
}

/** Applies one check-in answer to a dinner. */
export async function applyCheckIn(store: ChefStore, dinnerId: string, action: CheckInAction, today: string): Promise<CheckInResult> {
  const d = await store.dinner(dinnerId);
  if (!d) return { ok: false, error: "That dinner isn't in your plan anymore." };
  const title = await recipeTitle(store, d.recipeId);
  if (d.status === "moved") return { ok: false, error: `${title} was already moved to another night.` };
  if (d.status === "cooked") return { ok: false, error: `${title} is already marked cooked.` };
  if (d.status === "skipped") return { ok: false, error: `${title} was already skipped.` };

  const thisWeek = weekStartOf(today);
  switch (action) {
    case "cooked": {
      if (weekStartOf(d.date) > thisWeek) return { ok: false, error: `${title} is planned for a later week.` };
      await store.updateDinner(d.id, { status: "cooked" });
      return { ok: true, text: `Nice. ${title} is marked cooked.`, change: `Marked ${title} cooked`, undo: d.id };
    }
    case "skip": {
      await store.updateDinner(d.id, { status: "skipped" });
      return { ok: true, text: `Got it, ${title} is skipped.`, change: `Skipped ${title}`, undo: d.id };
    }
    case "later": {
      const weekEnd = addDays(weekStartOf(d.date), 6);
      const from = d.date < today ? today : addDays(d.date, 1);
      const night = await firstOpenNight(store, from, weekEnd);
      if (!night) return { ok: false, error: `There's no open night left this week for ${title}. Push it to next week instead?` };
      await moveTo(store, d, night, false);
      const when = night === today ? "tonight" : dayName(night);
      return { ok: true, text: `Moved ${title} to ${when}.`, change: `Moved ${title} to ${when}`, undo: d.id };
    }
    case "next_week": {
      const target = addDays(weekStartOf(d.date) > thisWeek ? weekStartOf(d.date) : thisWeek, 7);
      return push(store, d, target, today, title);
    }
  }
}

/** Undoes a check-in answer: the dinner is back to planned, and any copy it was moved to is removed. */
export async function undoCheckIn(store: ChefStore, dinnerId: string): Promise<CheckInResult> {
  const d = await store.dinner(dinnerId);
  if (!d) return { ok: false, error: "That dinner isn't in your plan anymore." };
  const title = await recipeTitle(store, d.recipeId);
  if (d.status === "planned") return { ok: false, error: `${title} isn't marked, so there's nothing to undo.` };
  if (d.status === "moved" && d.movedTo) {
    const copy = await store.dinner(d.movedTo);
    if (copy && copy.status !== "planned") return { ok: false, error: `${title} was already checked in on its new night.` };
    if (copy) await store.deleteDinner(copy.id);
  }
  await store.updateDinner(d.id, { status: "planned", movedTo: null });
  return { ok: true, text: `Undone. ${title} is back on ${dayName(d.date)}.`, change: `Undid the change to ${title}`, undo: d.id };
}

/** Dinners in the week of `weekStart` on or before `through` that nobody has checked in. */
export function unmarked(dinners: StoredDinner[], weekStart: string, through: string): StoredDinner[] {
  const end = addDays(weekStart, 6);
  return dinners.filter((d) => d.status === "planned" && d.date >= weekStart && d.date <= end && d.date <= through);
}

/**
 * Before Chef plans a week: dinners from the week before that were never
 * marked roll in first, on the earliest nights. Ones with fresh use-up
 * ingredients (likely bought already) go first. A dinner pushed twice goes
 * back to the library instead.
 */
export async function rollOver(
  store: ChefStore,
  weekStart: string,
  today: string,
  useUpOf: (recipeId: string) => string[],
): Promise<{ carried: string[]; returned: string[] }> {
  const prevStart = addDays(weekStart, -7);
  const before = await store.dinners(prevStart, addDays(prevStart, 6));
  const left = unmarked(before, prevStart, addDays(today, -1)).sort(
    (a, b) => useUpOf(b.recipeId).length - useUpOf(a.recipeId).length || a.date.localeCompare(b.date),
  );
  const carried: string[] = [];
  const returned: string[] = [];
  for (const d of left) {
    const title = await recipeTitle(store, d.recipeId);
    const r = await push(store, d, weekStart, today, title);
    if (!r.ok) break;
    (d.pushCount >= MAX_PUSHES ? returned : carried).push(title);
  }
  return { carried, returned };
}

/** Which reminder is due for a person, given their local date and hour. */
export function dueReminder(localToday: string, localHour: number): { kind: "thursday" | "sunday"; weekStart: string; through: string } | null {
  const weekStart = weekStartOf(localToday);
  const [, , , thursday, , , sunday] = weekDates(weekStart);
  // Thursday 7 PM: everything planned Monday through Thursday.
  if (localToday === thursday && localHour >= 19) return { kind: "thursday", weekStart, through: thursday };
  // Sunday 9 AM: the whole week so far (tonight's dinner hasn't happened yet).
  if (localToday === sunday && localHour >= 9) return { kind: "sunday", weekStart, through: addDays(sunday, -1) };
  return null;
}
