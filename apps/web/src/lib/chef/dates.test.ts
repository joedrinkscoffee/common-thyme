import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, relativeDay, todayIn, weekRangeLabel, weekStartOf, weekdayIndex } from "./dates";

describe("dates", () => {
  it("finds the Monday of a week", () => {
    expect(weekStartOf("2026-11-21")).toBe("2026-11-16"); // Saturday
    expect(weekStartOf("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23"); // Monday
    expect(weekdayIndex("2026-11-23")).toBe(0);
  });

  it("adds days across months", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("uses the household's time zone for today", () => {
    const lateEvening = new Date("2026-11-22T03:30:00Z"); // 10:30pm Saturday in New York
    expect(todayIn("America/New_York", lateEvening)).toBe("2026-11-21");
    expect(todayIn("Europe/London", lateEvening)).toBe("2026-11-22");
  });

  it("checks dates", () => {
    expect(isIsoDate("2026-11-24")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("tomorrow")).toBe(false);
  });

  it("labels weeks and days the way people say them", () => {
    expect(weekRangeLabel("2026-11-23")).toBe("Nov 23 – 29");
    expect(weekRangeLabel("2026-11-30")).toBe("Nov 30 – Dec 6");
    expect(relativeDay("2026-11-20", "2026-11-21")).toBe("last night");
    expect(relativeDay("2026-11-18", "2026-11-21")).toBe("on Wednesday");
    expect(relativeDay("2026-11-21", "2026-11-21")).toBe("tonight");
  });
});
