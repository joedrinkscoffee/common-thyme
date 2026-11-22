import { describe, expect, it } from "vitest";
import { defaultNights, easter, holidayWeekName, holidaysInWeek, nthWeekday } from "./holidays";

describe("holidays", () => {
  it("finds Thanksgiving and the leftovers night", () => {
    expect(nthWeekday(2026, 11, 3, 4)).toBe("2026-11-26");
    expect(nthWeekday(2027, 11, 3, 4)).toBe("2027-11-25");
    const week = holidaysInWeek("2026-11-23").map((h) => [h.date, h.effect]);
    expect(week).toEqual([
      ["2026-11-26", "skip"],
      ["2026-11-27", "leftovers"],
    ]);
    expect(holidayWeekName("2026-11-23")).toBe("Thanksgiving week");
  });

  it("plans fewer nights around holiday meals", () => {
    expect(defaultNights("2026-11-23", 5)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(defaultNights("2026-11-16", 5)).toHaveLength(5);
    // Christmas 2026 is a Friday; Christmas Eve Thursday.
    expect(defaultNights("2026-12-21", 5)).toEqual(["2026-12-21", "2026-12-22", "2026-12-23"]);
  });

  it("works out moving holidays", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(nthWeekday(2026, 5, 0, -1)).toBe("2026-05-25"); // Memorial Day
    expect(nthWeekday(2026, 9, 0, 1)).toBe("2026-09-07"); // Labor Day
  });

  it("spans the new year", () => {
    expect(holidaysInWeek("2026-12-28").map((h) => h.name)).toEqual(["New Year's Eve", "New Year's Day"]);
  });
});
