/**
 * Chef always has a draft: when the home page opens and a week has nothing
 * planned, Chef drafts it in code (no model call, so it's free and instant)
 * and says so in the chat, asking if there's anything in particular. Runs at
 * most once per week; the chat message is the record that it ran.
 *
 * Weeks it looks at: this week while at least two usual nights are left,
 * and next week from Friday on.
 */
import { addDays, dayName, weekStartOf, weekdayIndex } from "./dates";
import { defaultNights, holidayWeekName, isOpenNight } from "./holidays";
import { ChefSession, type Choice, type DraftSummary } from "./session";
import type { ChefStore } from "./store";
import type { CalendarNight } from "./calendar";

export type AutoDraftMessage = { weekStart: string; body: string; choice: Choice; changes: string[] };

export const AUTO_DRAFT_CHOICES = ["Looks good, lock it in", "One night needs to be quick", "Fewer dinners", "Swap a dinner"];

/** Weeks that might need a draft today. */
export function weeksToDraft(today: string, dinnersPerWeek: number): string[] {
  const thisWeek = weekStartOf(today);
  const out: string[] = [];
  if (defaultNights(thisWeek, dinnersPerWeek).filter((d) => d >= today).length >= 2) out.push(thisWeek);
  if (weekdayIndex(today) >= 4) out.push(addDays(thisWeek, 7));
  return out;
}

function nightsRange(nights: string[]): string {
  const days = nights.map((d) => dayName(d));
  if (days.length <= 2) return days.join(" and ");
  const consecutive = nights.every((d, i) => i === 0 || addDays(nights[i - 1], 1) === d);
  return consecutive ? `${days[0]} to ${days.at(-1)}` : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
}

/** Chef's message about a fresh draft, written in code. */
export function draftMessage(draft: DraftSummary, today: string): string {
  const isThisWeek = draft.weekStart === weekStartOf(today);
  const holidayWeek = holidayWeekName(draft.weekStart);
  const which = holidayWeek ? `${isThisWeek ? "this" : "next"} week, ${holidayWeek},` : isThisWeek ? "the rest of this week" : "next week";
  const n = draft.nights.length;
  const parts = [`I drafted ${which} so there's a plan to start from: ${n} ${n === 1 ? "dinner" : "dinners"}, ${nightsRange(draft.nights)}.`];
  const open = draft.holidays.filter(isOpenNight);
  if (open.length) {
    const said = open.map((h) => (h.effect === "leftovers" ? `${dayName(h.date)} for leftovers` : `${dayName(h.date)} for ${h.name}`));
    parts.push(`I left ${said.join(" and ")}.`);
  }
  if (draft.shared.length) {
    const names = draft.shared.slice(0, 2).map((s) => `**${s.name}**`);
    parts.push(`It shares ${names.join(" and ")} across nights.`);
  }
  const busy = draft.calendar.filter((c) => c.kind === "busy");
  const away = draft.calendar.filter((c) => c.kind === "away");
  if (away.length) parts.push(`Your calendar has you away ${away.map((c) => dayName(c.date)).join(" and ")}, so I left ${away.length === 1 ? "it" : "them"} open.`);
  if (busy.length) {
    const what = busy.map((c) => `${dayName(c.date)} (${c.titles[0].replace(/ at .*$/, "")})`);
    parts.push(`${what.join(" and ")} ${busy.length === 1 ? "gets" : "get"} a dinner of 30 minutes or less.`);
  }
  if (draft.kidNights) parts.push(`The kids share ${draft.kidNights}, like last week.`);
  parts.push("Anything in particular this week? A craving, a busy night, people over?");
  return parts.join(" ");
}

/**
 * Drafts each week that needs one and returns Chef's messages about them.
 * hasDrafted / the caller's save of the message keep it to once per week.
 */
export async function ensureDrafts(opts: {
  store: ChefStore;
  today: string;
  hasDrafted: (weekStart: string) => Promise<boolean>;
  /** The household calendar's nights, read only when a week needs drafting. */
  calendar?: () => Promise<CalendarNight[] | null>;
}): Promise<AutoDraftMessage[]> {
  const { store, today } = opts;
  const settings = await store.settings();
  const out: AutoDraftMessage[] = [];
  let calendar: CalendarNight[] | null | undefined;
  for (const weekStart of weeksToDraft(today, settings.dinnersPerWeek)) {
    const end = addDays(weekStart, 6);
    const [plans, dinners] = await Promise.all([store.plans(weekStart, weekStart), store.dinners(addDays(weekStart, -7), end)]);
    if (plans[0]?.status === "approved") continue;
    // Something the household planned themselves: leave the week alone.
    // Dinners carried over from an earlier week don't count.
    const carried = new Set(dinners.filter((d) => d.status === "moved" && d.date < weekStart && d.movedTo).map((d) => d.movedTo));
    const own = dinners.filter((d) => d.date >= weekStart && d.status !== "moved" && !carried.has(d.id));
    if (own.length) continue;
    if (await opts.hasDrafted(weekStart)) continue;

    const session = new ChefSession(store, today);
    await session.load();
    if (calendar === undefined) calendar = opts.calendar ? await opts.calendar().catch(() => null) : null;
    session.calendar = calendar;
    const lastWeek = dinners.filter((d) => d.date < weekStart && d.status !== "moved");
    const kids = lastWeek.filter((d) => d.sharedWithKids && d.status !== "skipped").length;
    // Only fill empty nights, so carried-over dinners stay where they are.
    const taken = new Set(dinners.filter((d) => d.date >= weekStart && d.status !== "moved" && d.meal === "dinner").map((d) => d.date));
    const away = new Set(session.calendarIn(weekStart).filter((c) => c.kind === "away").map((c) => c.date));
    const nights = defaultNights(weekStart, settings.dinnersPerWeek).filter((d) => d >= today && !taken.has(d) && !away.has(d));
    if (!nights.length) continue;
    const result = await session.planWeekTool({ week_start: weekStart, nights, kid_nights: kids });
    if (!result.ok || !session.lastDraft) continue;
    out.push({
      weekStart,
      body: draftMessage(session.lastDraft, today),
      choice: { question: "Anything in particular this week?", choices: AUTO_DRAFT_CHOICES },
      changes: session.changes,
    });
  }
  return out;
}
