/**
 * The household's calendar, read from a private iCal link (Google Calendar's
 * "secret address in iCal format", or the same from iCloud or Outlook).
 * Chef only looks at the weeks it plans, and only at what changes dinner:
 * evenings with something on (a quick dinner that night) and travel (no
 * dinner at home).
 */
import ICAL from "ical.js";
import { addDays } from "./dates";

export type CalendarEvent = {
  /** Local date, "2026-11-24". */
  date: string;
  title: string;
  /** Local "17:30", or null for an all-day event. */
  start: string | null;
  end: string | null;
};

export type EveningKind = "away" | "busy";
export type CalendarNight = { date: string; kind: EveningKind; titles: string[] };

const HOSTS = [/^calendar\.google\.com$/, /(^|\.)icloud\.com$/, /^outlook\.(live|office365|office)\.com$/];

/** Checks a pasted link and returns the https version, or why it won't work. */
export function normalizeCalendarUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a link." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "The link should start with https:// or webcal://." };
  if (!HOSTS.some((h) => h.test(url.hostname))) {
    return { ok: false, error: "Use the private iCal link from Google Calendar, iCloud or Outlook." };
  }
  if (url.hostname === "calendar.google.com" && !/\/ical\/.+\.ics$/.test(url.pathname)) {
    return { ok: false, error: "In Google Calendar, copy the \"Secret address in iCal format\" (it ends in .ics)." };
  }
  return { ok: true, url: url.toString() };
}

/** Downloads the calendar file. Small and quick, or it gives up. */
export async function fetchCalendar(url: string, timeoutMs = 6000): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow", headers: { accept: "text/calendar" } });
    if (!res.ok) return { ok: false, error: res.status === 404 ? "That link no longer works. It may have been reset." : `The calendar answered ${res.status}.` };
    const text = await res.text();
    if (text.length > 5_000_000) return { ok: false, error: "That calendar is too big to read." };
    if (!text.includes("BEGIN:VCALENDAR")) return { ok: false, error: "That link isn't a calendar file." };
    return { ok: true, text };
  } catch {
    return { ok: false, error: "Couldn't reach the calendar." };
  }
}

function localParts(date: Date, timeZone: string): { date: string; time: string } {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Events from one local date to another (inclusive), recurring ones expanded. */
export function parseEvents(ics: string, from: string, to: string, timeZone: string): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // A broken time zone falls back to UTC.
    }
  }
  const vevents = root.getAllSubcomponents("vevent");
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const v of vevents) {
    if (String(v.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const e = new ICAL.Event(v);
    if (v.hasProperty("recurrence-id")) exceptions.push(e);
    else masters.set(e.uid, e);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  // Pad a day each side so time zones can't push an event out of the window.
  const lo = Date.parse(`${addDays(from, -1)}T00:00:00Z`);
  const hi = Date.parse(`${addDays(to, 2)}T00:00:00Z`);
  const out: CalendarEvent[] = [];
  const add = (start: ICAL.Time, end: ICAL.Time | null, title: string) => {
    if (start.isDate) {
      // All day: one entry per day, end date exclusive.
      const first = start.toString().slice(0, 10);
      const last = end ? addDays(end.toString().slice(0, 10), -1) : first;
      for (let d = first, n = 0; d <= last && n < 31; d = addDays(d, 1), n++) {
        if (d >= from && d <= to) out.push({ date: d, title, start: null, end: null });
      }
      return;
    }
    const s = localParts(start.toJSDate(), timeZone);
    const e = end ? localParts(end.toJSDate(), timeZone) : null;
    if (s.date >= from && s.date <= to) out.push({ date: s.date, title, start: s.time, end: e && e.date === s.date ? e.time : null });
  };

  for (const e of masters.values()) {
    const title = (e.summary || "Busy").trim().slice(0, 80);
    if (!e.isRecurring()) {
      const t = e.startDate.toJSDate().getTime();
      const endT = e.endDate ? e.endDate.toJSDate().getTime() : t;
      if (endT >= lo && t <= hi) add(e.startDate, e.endDate, title);
      continue;
    }
    const it = e.iterator();
    for (let i = 0, next = it.next(); next && i < 1000; i++, next = it.next()) {
      const t = next.toJSDate().getTime();
      if (t > hi) break;
      if (t < lo - 31 * 86_400_000) continue;
      const occ = e.getOccurrenceDetails(next);
      if (String(occ.item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
      add(occ.startDate, occ.endDate, (occ.item.summary || title).trim().slice(0, 80));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
}

const AWAY = /\b(travel(ing|ling)?|trip|flights?|fly(ing)?|vacation|away|out of town|hotel|airport|conference|camping|ooo|out of office)\b|✈/i;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** When something on the calendar overlaps dinner prep and eating, 4:30 to 7:30 PM. */
export function overlapsDinner(e: CalendarEvent): boolean {
  if (!e.start) return false;
  const s = minutes(e.start);
  const end = e.end ? minutes(e.end) : s + 60;
  return s < 19 * 60 + 30 && end > 16 * 60 + 30;
}

/** The nights the calendar changes: away (travel) or busy (something on at dinnertime). */
export function calendarNights(events: CalendarEvent[]): CalendarNight[] {
  const byDate = new Map<string, CalendarNight>();
  for (const e of events) {
    const kind: EveningKind | null = AWAY.test(e.title) ? "away" : overlapsDinner(e) ? "busy" : null;
    if (!kind) continue;
    const night = byDate.get(e.date) ?? { date: e.date, kind, titles: [] };
    if (kind === "away") night.kind = "away";
    const label = e.start ? `${e.title} at ${clock(e.start)}` : e.title;
    if (!night.titles.includes(label)) night.titles.push(label);
    byDate.set(e.date, night);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** "5:30 PM" */
export function clock(hhmm: string): string {
  const m = minutes(hhmm);
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
