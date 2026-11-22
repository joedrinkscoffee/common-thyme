import { describe, expect, it } from "vitest";
import { calendarNights, clock, normalizeCalendarUrl, parseEvents } from "./calendar";
import { MemoryStore } from "./memory-store";
import { ChefSession } from "./session";
import { ensureDrafts } from "./auto-draft";
import type { CatalogRecipe } from "./planner";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:STANDARD",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
  // Soccer every Tuesday at 5:30 PM since September, but not Dec 8.
  "BEGIN:VEVENT",
  "UID:soccer@x",
  "SUMMARY:Soccer practice",
  "DTSTART;TZID=America/New_York:20260901T173000",
  "DTEND;TZID=America/New_York:20260901T190000",
  "RRULE:FREQ=WEEKLY;BYDAY=TU",
  "EXDATE;TZID=America/New_York:20261208T173000",
  "END:VEVENT",
  // A dentist appointment in the morning doesn't matter.
  "BEGIN:VEVENT",
  "UID:dentist@x",
  "SUMMARY:Dentist",
  "DTSTART:20261202T150000Z",
  "DTEND:20261202T160000Z",
  "END:VEVENT",
  // Away Thursday Dec 3 to Saturday Dec 5 (end date exclusive).
  "BEGIN:VEVENT",
  "UID:trip@x",
  "SUMMARY:Trip to Denver",
  "DTSTART;VALUE=DATE:20261203",
  "DTEND;VALUE=DATE:20261206",
  "END:VEVENT",
  // A school concert at 6 PM, in UTC.
  "BEGIN:VEVENT",
  "UID:concert@x",
  "SUMMARY:Winter concert",
  "DTSTART:20261201T230000Z",
  "DTEND:20261202T000000Z",
  "END:VEVENT",
  // Cancelled.
  "BEGIN:VEVENT",
  "UID:gone@x",
  "STATUS:CANCELLED",
  "SUMMARY:Book club",
  "DTSTART;TZID=America/New_York:20261130T180000",
  "DTEND;TZID=America/New_York:20261130T200000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const TZ = "America/New_York";

describe("calendar link", () => {
  it("accepts private links from Google, iCloud and Outlook only", () => {
    expect(normalizeCalendarUrl("https://calendar.google.com/calendar/ical/joe%40gmail.com/private-abc/basic.ics")).toMatchObject({ ok: true });
    expect(normalizeCalendarUrl("webcal://p42-caldav.icloud.com/published/2/abc")).toEqual({ ok: true, url: "https://p42-caldav.icloud.com/published/2/abc" });
    expect(normalizeCalendarUrl("https://calendar.google.com/calendar/u/0/r")).toMatchObject({ ok: false });
    expect(normalizeCalendarUrl("https://169.254.169.254/latest")).toMatchObject({ ok: false });
    expect(normalizeCalendarUrl("http://calendar.google.com/calendar/ical/x/basic.ics")).toMatchObject({ ok: false });
    expect(normalizeCalendarUrl("not a link")).toMatchObject({ ok: false });
  });
});

describe("reading events", () => {
  const events = parseEvents(ICS, "2026-11-30", "2026-12-13", TZ);

  it("expands weekly events in local time and skips exceptions and cancellations", () => {
    const soccer = events.filter((e) => e.title === "Soccer practice");
    expect(soccer.map((e) => [e.date, e.start, e.end])).toEqual([["2026-12-01", "17:30", "19:00"]]);
    expect(events.find((e) => e.title === "Book club")).toBeUndefined();
    expect(events.find((e) => e.title === "Winter concert")).toMatchObject({ date: "2026-12-01", start: "18:00" });
    expect(events.filter((e) => e.title === "Trip to Denver").map((e) => e.date)).toEqual(["2026-12-03", "2026-12-04", "2026-12-05"]);
  });

  it("turns them into busy and away nights", () => {
    expect(calendarNights(events)).toEqual([
      { date: "2026-12-01", kind: "busy", titles: ["Soccer practice at 5:30 PM", "Winter concert at 6 PM"] },
      { date: "2026-12-03", kind: "away", titles: ["Trip to Denver"] },
      { date: "2026-12-04", kind: "away", titles: ["Trip to Denver"] },
      { date: "2026-12-05", kind: "away", titles: ["Trip to Denver"] },
    ]);
    expect(clock("09:05")).toBe("9:05 AM");
    expect(clock("12:00")).toBe("12 PM");
  });
});

const r = (id: string, useUp: string[], minutes: number): CatalogRecipe => ({ id, title: id[0].toUpperCase() + id.slice(1), tags: [], totalMinutes: minutes, useUp });
const recipes = () => [
  r("braise", ["kale", "carrot"], 120),
  r("salad", ["kale", "goat cheese"], 15),
  r("pasta", ["spinach", "goat cheese"], 45),
  r("curry", ["spinach", "carrot"], 50),
  r("tacos", ["cilantro", "cabbage"], 40),
  r("stirfry", ["broccoli", "scallion"], 25),
];

describe("planning around the calendar", () => {
  it("gives busy evenings a quick dinner and leaves travel nights open", async () => {
    const store = new MemoryStore(recipes());
    const session = new ChefSession(store, "2026-11-29");
    await session.load();
    session.calendar = calendarNights(parseEvents(ICS, "2026-11-29", "2026-12-27", TZ));
    const out = await session.planWeekTool({ week_start: "2026-11-30", kid_nights: 0 });
    expect(out.ok).toBe(true);
    const byDate = new Map(store.dinnerList.map((d) => [d.date, d.recipeId]));
    expect([...byDate.keys()].sort()).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(["salad", "stirfry"]).toContain(byDate.get("2026-12-01"));
    expect(out.text).toContain("Quick nights (30 min or less): 2026-12-01.");
    const state = await session.stateText(true);
    expect(state).toContain("Calendar: Tue 2026-12-01 Soccer practice at 5:30 PM; Winter concert at 6 PM (busy at dinnertime");
    expect(state).toContain("Calendar: Thu 2026-12-03 Trip to Denver (looks like travel");
  });

  it("the auto-draft says what the calendar changed", async () => {
    const store = new MemoryStore(recipes());
    const msgs = await ensureDrafts({
      store,
      today: "2026-11-29",
      hasDrafted: async () => false,
      calendar: async () => calendarNights(parseEvents(ICS, "2026-11-29", "2026-12-27", TZ)),
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain("Your calendar has you away Thursday and Friday, so I left them open.");
    expect(msgs[0].body).toContain("Tuesday (Soccer practice) gets a dinner of 30 minutes or less.");
  });

  it("says when no calendar is linked", async () => {
    const session = new ChefSession(new MemoryStore(recipes()), "2026-11-29");
    await session.load();
    expect(await session.stateText(true)).toContain("Calendar: not linked.");
  });
});
