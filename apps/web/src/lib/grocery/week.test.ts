import { describe, expect, it } from "vitest";
import { defaultGroceryWeek, groceryWeekParam } from "./week";

describe("defaultGroceryWeek", () => {
  const both = () => true;
  it("opens next week's list from Thursday on", () => {
    expect(defaultGroceryWeek("2026-11-26", both)).toBe("2026-11-30"); // Thu
    expect(defaultGroceryWeek("2026-11-29", both)).toBe("2026-11-30"); // Sun
  });
  it("opens this week's list early in the week", () => {
    expect(defaultGroceryWeek("2026-11-24", both)).toBe("2026-11-23");
  });
  it("falls back to whichever week has meals", () => {
    expect(defaultGroceryWeek("2026-11-24", (w) => w === "2026-11-30")).toBe("2026-11-30");
    expect(defaultGroceryWeek("2026-11-27", (w) => w === "2026-11-23")).toBe("2026-11-23");
    expect(defaultGroceryWeek("2026-11-27", () => false)).toBe("2026-11-23");
  });
});

describe("groceryWeekParam", () => {
  it("takes this week or next, by any date in it", () => {
    expect(groceryWeekParam("2026-12-02", "2026-11-24")).toBe("2026-11-30");
    expect(groceryWeekParam("2026-11-23", "2026-11-24")).toBe("2026-11-23");
    expect(groceryWeekParam("2026-12-14", "2026-11-24")).toBeNull();
    expect(groceryWeekParam("nope", "2026-11-24")).toBeNull();
  });
});
