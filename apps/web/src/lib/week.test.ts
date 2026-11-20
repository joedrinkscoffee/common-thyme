import { describe, expect, it } from "vitest";
import { servingsFor, sharedPerishables, weekdayLabel, type Dinner } from "./week";

const dinner = (date: string, names: string[], perishable = true): Dinner => ({
  date,
  title: date,
  tint: "#fff",
  sharedWithKids: false,
  ingredients: names.map((name) => ({ name, perishable })),
});

describe("sharedPerishables", () => {
  it("lists perishables used on two or more nights, most-shared first", () => {
    const result = sharedPerishables([
      dinner("2026-11-23", ["Lemon", "Capers"]),
      dinner("2026-11-24", ["lemon", "Kale", "Capers"]),
      dinner("2026-11-25", ["Kale"]),
      dinner("2026-11-26", ["Lemon", "Ricotta"]),
    ]);
    expect(result).toEqual([
      { name: "Lemon", dates: ["2026-11-23", "2026-11-24", "2026-11-26"] },
      { name: "Capers", dates: ["2026-11-23", "2026-11-24"] },
      { name: "Kale", dates: ["2026-11-24", "2026-11-25"] },
    ]);
  });

  it("ignores pantry staples and single-night ingredients", () => {
    expect(
      sharedPerishables([dinner("2026-11-23", ["Olive oil"], false), dinner("2026-11-24", ["Olive oil"], false)]),
    ).toEqual([]);
    expect(sharedPerishables([dinner("2026-11-23", ["Lemon", "Lemon"])])).toEqual([]);
  });
});

describe("weekdayLabel", () => {
  it("does not shift the day across time zones", () => {
    expect(weekdayLabel("2026-11-23")).toBe("MON");
    expect(weekdayLabel("2026-11-27")).toBe("FRI");
  });
});

describe("servingsFor", () => {
  it("adds the kids' servings only to dinners shared with them", () => {
    const settings = { baseServings: 2, kidsExtraServings: 2 };
    expect(servingsFor({ sharedWithKids: false }, settings)).toBe(2);
    expect(servingsFor({ sharedWithKids: true }, settings)).toBe(4);
  });
});
