/**
 * Calendar days for planning. Every date is a plain "YYYY-MM-DD" string in the
 * household's own time zone, so nothing shifts when a server runs in UTC.
 * Weeks start on Monday.
 */

/** Today's date in a time zone, e.g. "2026-11-21". */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The hour (0-23) in a time zone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  } catch {
    return now.getUTCHours();
  }
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return toUtc(v).toISOString().slice(0, 10) === v;
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: string): number {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

/** The Monday of the week holding this date. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** The seven dates of the week starting on this Monday. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** "Mon", "Tuesday", etc. */
export function dayName(iso: string, style: "short" | "long" = "long"): string {
  return toUtc(iso).toLocaleDateString("en-US", { weekday: style, timeZone: "UTC" });
}

/** "Nov 23" */
export function shortDate(iso: string): string {
  return toUtc(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Nov 23 – 29", or "Nov 30 – Dec 6" across months. */
export function weekRangeLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const a = shortDate(weekStart);
  const b = shortDate(end);
  return weekStart.slice(5, 7) === end.slice(5, 7) ? `${a} – ${b.split(" ")[1]}` : `${a} – ${b}`;
}

/** "tonight", "tomorrow", "last night", "on Thursday", "on Mon, Dec 1" */
export function relativeDay(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "tonight";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "last night";
  if (diff > 1 && diff < 7 && weekStartOf(iso) === weekStartOf(today)) return `on ${dayName(iso)}`;
  if (diff < -1 && diff > -7) return `on ${dayName(iso)}`;
  return `on ${dayName(iso, "short")}, ${shortDate(iso)}`;
}
