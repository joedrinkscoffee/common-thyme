/**
 * US holidays that change what a household eats that night. Worked out from
 * the calendar in code, so nothing needs to be looked up or stored.
 *
 * - skip: a big holiday meal of its own; Chef doesn't plan dinner.
 * - leftovers: the day after a big meal; Chef leaves the night open.
 * - quick: a busy evening (trick-or-treating); something fast.
 * - cookout: a grilling holiday; grill dinners fit.
 * - note: worth knowing (Valentine's Day, game day); Chef may ask.
 */
import { addDays, weekDates, weekdayIndex } from "./dates";

export type HolidayEffect = "skip" | "leftovers" | "quick" | "cookout" | "note";
export type Holiday = { date: string; name: string; effect: HolidayEffect };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The nth weekday (0 Monday … 6 Sunday) of a month; n = -1 for the last one. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = iso(year, month, 1);
    const offset = (weekday - weekdayIndex(first) + 7) % 7;
    return addDays(first, offset + (n - 1) * 7);
  }
  const nextFirst = month === 12 ? iso(year + 1, 1, 1) : iso(year, month + 1, 1);
  const last = addDays(nextFirst, -1);
  return addDays(last, -((weekdayIndex(last) - weekday + 7) % 7));
}

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

export function holidaysOfYear(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 3, 4);
  return [
    { date: iso(year, 1, 1), name: "New Year's Day", effect: "note" },
    { date: nthWeekday(year, 2, 6, 2), name: "the Super Bowl", effect: "note" },
    { date: iso(year, 2, 14), name: "Valentine's Day", effect: "note" },
    { date: easter(year), name: "Easter", effect: "skip" },
    { date: nthWeekday(year, 5, 6, 2), name: "Mother's Day", effect: "note" },
    { date: nthWeekday(year, 5, 0, -1), name: "Memorial Day", effect: "cookout" },
    { date: nthWeekday(year, 6, 6, 3), name: "Father's Day", effect: "cookout" },
    { date: iso(year, 7, 4), name: "the Fourth of July", effect: "cookout" },
    { date: nthWeekday(year, 9, 0, 1), name: "Labor Day", effect: "cookout" },
    { date: iso(year, 10, 31), name: "Halloween", effect: "quick" },
    { date: thanksgiving, name: "Thanksgiving", effect: "skip" },
    { date: addDays(thanksgiving, 1), name: "Thanksgiving leftovers", effect: "leftovers" },
    { date: iso(year, 12, 24), name: "Christmas Eve", effect: "skip" },
    { date: iso(year, 12, 25), name: "Christmas", effect: "skip" },
    { date: iso(year, 12, 26), name: "Christmas leftovers", effect: "leftovers" },
    { date: iso(year, 12, 31), name: "New Year's Eve", effect: "note" },
  ];
}

/** Holidays from one date to another, inclusive. */
export function holidaysBetween(from: string, to: string): Holiday[] {
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  return [...years]
    .flatMap(holidaysOfYear)
    .filter((h) => h.date >= from && h.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function holidaysInWeek(weekStart: string): Holiday[] {
  return holidaysBetween(weekStart, addDays(weekStart, 6));
}

/** Nights Chef leaves open by default: big holiday meals and the leftovers after. */
export function isOpenNight(h: Holiday) {
  return h.effect === "skip" || h.effect === "leftovers";
}

/** The week's usual dinner nights, minus holiday meals and leftover nights. */
export function defaultNights(weekStart: string, dinnersPerWeek: number): string[] {
  const off = new Set(holidaysInWeek(weekStart).filter(isOpenNight).map((h) => h.date));
  return weekDates(weekStart)
    .slice(0, dinnersPerWeek)
    .filter((d) => !off.has(d));
}

/** The holiday that names the week, like "Thanksgiving week". */
export function holidayWeekName(weekStart: string): string | null {
  const big = holidaysInWeek(weekStart).find((h) => h.effect === "skip");
  return big ? `${big.name} week` : null;
}
