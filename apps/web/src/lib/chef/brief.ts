/**
 * Chef's note at the top of the home page: what's happening this week, what
 * still needs using up, and the one thing to ask. Written in code, not by the
 * model, so opening the app costs nothing and is instant.
 */
import { addDays, dayName, relativeDay, weekDates, weekRangeLabel, weekStartOf, weekdayIndex } from "./dates";
import type { DinnerStatus, PlanStatus } from "./store";

export type HomeDinner = {
  id: string;
  date: string;
  recipeId: string;
  title: string;
  photoUrl: string | null;
  sharedWithKids: boolean;
  status: DinnerStatus;
  perishables: string[];
};

export type HomeWeek = {
  weekStart: string;
  label: string;
  range: string;
  status: PlanStatus | null;
  dinners: HomeDinner[];
};

/** A paragraph: plain text, bold dish names and ingredient stickers. */
export type Segment = string | { bold: string } | { sticker: string };

export type Brief = {
  paragraphs: Segment[][];
  checkIn: { dinnerId: string; title: string; when: string } | null;
  suggestions: string[];
};

function sharedLeft(dinners: HomeDinner[]): { name: string; n: number }[] {
  const c = new Map<string, number>();
  for (const d of dinners) for (const p of new Set(d.perishables)) c.set(p, (c.get(p) ?? 0) + 1);
  return [...c.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([name, n]) => ({ name, n }));
}

function stickerList(items: { name: string; n: number }[]): Segment[] {
  const out: Segment[] = [];
  items.forEach((s, i) => {
    if (i > 0) out.push(i === items.length - 1 ? " and " : ", ");
    out.push({ sticker: `${s.name} × ${s.n}` });
  });
  return out;
}

export function greeting(hour: number, firstName: string | null): string {
  const part = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return firstName ? `${part}, ${firstName}.` : `${part}.`;
}

/** The weeks the home page shows: this one, and the next once it matters. */
export function homeWeekStarts(today: string): string[] {
  const thisWeek = weekStartOf(today);
  return [thisWeek, addDays(thisWeek, 7)];
}

export function weekLabel(weekStart: string, today: string): string {
  const diff = (Date.parse(weekStart) - Date.parse(weekStartOf(today))) / (7 * 86_400_000);
  return diff === 0 ? "This week" : diff === 1 ? "Next week" : diff === -1 ? "Last week" : `Week of ${weekRangeLabel(weekStart)}`;
}

export function buildBrief(opts: {
  today: string;
  hour: number;
  firstName: string | null;
  thisWeek: HomeWeek;
  nextWeek: HomeWeek;
  lastWeek: { cooked: number; total: number } | null;
  recipeCount: number;
}): Brief {
  const { today, thisWeek, nextWeek } = opts;
  const paragraphs: Segment[][] = [];
  const suggestions: string[] = [];
  const day = weekdayIndex(today); // 0 Monday … 6 Sunday
  const lateWeek = day >= 4;

  if (opts.recipeCount === 0) {
    return {
      paragraphs: [[greeting(opts.hour, opts.firstName), " Once there are some recipes in, I can plan your week. Paste me a link to get started."]],
      checkIn: null,
      suggestions: ["Add a recipe from a link"],
    };
  }

  // This week.
  const live = thisWeek.dinners.filter((d) => d.status !== "moved");
  const cooked = live.filter((d) => d.status === "cooked").length;
  const upcoming = live.filter((d) => d.status === "planned" && d.date >= today);
  const tonight = upcoming.find((d) => d.date === today);
  const first: Segment[] = [greeting(opts.hour, opts.firstName), " "];
  if (opts.lastWeek && day <= 1 && opts.lastWeek.total > 0) {
    first.push(`Last week you cooked ${opts.lastWeek.cooked} of ${opts.lastWeek.total}. `);
  }
  if (!live.length) {
    first.push("Nothing's planned for this week yet.");
    if (!lateWeek) suggestions.push("Plan the rest of this week");
  } else {
    if (tonight) first.push("Tonight is ", { bold: tonight.title }, ". ");
    if (cooked > 0) first.push(`You've cooked ${cooked} of ${live.length} so far.`);
    else if (!tonight) first.push(`${live.length} ${live.length === 1 ? "dinner is" : "dinners are"} planned this week.`);
  }
  const left = sharedLeft(upcoming);
  if (left.length && upcoming.length > 1) first.push(" Still to use up: ", ...stickerList(left), ".");
  paragraphs.push(first);

  // The one thing to ask: the most recent dinner nobody checked in on.
  const missed = live
    .filter((d) => d.status === "planned" && d.date < today && d.date >= addDays(today, -4))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const checkIn = missed ? { dinnerId: missed.id, title: missed.title, when: relativeDay(missed.date, today) } : null;

  // Next week, once it's close.
  if (lateWeek || !upcoming.length) {
    const next = nextWeek.dinners.filter((d) => d.status !== "moved");
    if (!next.length) {
      paragraphs.push(["Next week isn't planned yet. Want me to draft it?"]);
      suggestions.unshift("Plan next week");
    } else if (nextWeek.status === "approved") {
      paragraphs.push([`Next week is locked in: ${next.length} dinners.`]);
    } else {
      const shared = sharedLeft(next);
      paragraphs.push([
        `Next week's draft has ${next.length} dinners`,
        ...(shared.length ? [" built around ", ...stickerList(shared)] : []),
        ". Tell me what to change, or say the word and I'll lock it in.",
      ]);
      suggestions.unshift("Lock in next week");
      suggestions.push("Swap a dinner");
    }
  } else if (upcoming.length) {
    suggestions.push("Move a dinner");
  }
  suggestions.push("Add a recipe from a link");

  return { paragraphs, checkIn, suggestions: [...new Set(suggestions)].slice(0, 3) };
}

/** Day labels for every night in a week, for tile placeholders. */
export function nightsOf(weekStart: string) {
  return weekDates(weekStart).map((d) => ({ date: d, day: dayName(d, "short").toUpperCase() }));
}
