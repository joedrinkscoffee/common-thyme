import { describe, expect, it } from "vitest";
import { monthOfWeek, recipeSeasons, seasonFit } from "./season";
import { planWeek, type CatalogRecipe } from "./planner";

const r = (title: string, useUp: string[] = [], tags: string[] = [], totalMinutes: number | null = 40): CatalogRecipe => ({
  id: title.toLowerCase().replace(/\W+/g, "-"),
  title,
  tags,
  totalMinutes,
  useUp,
});

describe("seasons", () => {
  it("reads seasons from titles, ingredients and tags", () => {
    expect(recipeSeasons(r("Creamy Corn & Poblano Flatbread", ["corn", "poblano"]))).toEqual(["summer"]);
    expect(recipeSeasons(r("Miso & Shiitake Ramen", ["shiitake"]))).toEqual(["cold"]);
    expect(recipeSeasons(r("Cheddar Burgers", ["ground beef"]))).toEqual(["summer"]);
    expect(recipeSeasons(r("Butternut Squash Risotto", ["butternut squash"]))).toEqual(["fall"]);
    expect(recipeSeasons(r("Chicken Piccata", ["chicken breast"]))).toEqual([]);
    // Not fresh corn, and not a chili dish.
    expect(recipeSeasons(r("Fish Tacos", ["corn tortilla", "cabbage"]))).toEqual([]);
    expect(recipeSeasons(r("Noodles with Black Bean Chili Oil", ["black bean chili oil"]))).toEqual([]);
    // Tags win.
    expect(recipeSeasons(r("Cheddar Burgers", [], ["year round"]))).toEqual([]);
    expect(recipeSeasons(r("Pasta e Fagioli", [], ["winter"]))).toEqual(["cold"]);
  });

  it("scores fit by month", () => {
    const corn = r("Corn Chowder", ["corn"]); // summer and cold
    expect(seasonFit(corn, 8)).toBe(2);
    expect(seasonFit(corn, 12)).toBe(2);
    expect(seasonFit(r("Grilled Steak"), 12)).toBe(-4);
    expect(seasonFit(r("Grilled Steak"), 7)).toBe(2);
    expect(monthOfWeek("2026-11-30")).toBe(12);
  });

  it("planning favors what's in season", () => {
    const catalog = [
      r("Grilled Corn Salad", ["corn"]),
      r("Cheddar Burgers", ["ground beef"]),
      r("Miso Ramen", ["shiitake"]),
      r("Lentil Soup", ["carrot"]),
      r("Chicken Piccata", ["chicken breast"]),
    ];
    const dates = ["2026-11-23", "2026-11-24", "2026-11-25"];
    const winter = planWeek({ catalog, dates, kidNights: 0, month: 11, seed: 1 });
    const titles = winter.nights.map((n) => catalog.find((c) => c.id === n.recipeId)!.title).sort();
    expect(titles).toEqual(["Chicken Piccata", "Lentil Soup", "Miso Ramen"]);
    expect(winter.outOfSeason).toEqual([]);
    const summer = planWeek({ catalog, dates, kidNights: 0, month: 7, seed: 1 });
    expect(summer.nights.map((n) => n.recipeId)).toEqual(expect.arrayContaining(["grilled-corn-salad", "cheddar-burgers"]));
  });

  it("puts a quick dinner on a quick night", () => {
    const catalog = [r("Slow Braise", ["kale"], [], 120), r("Kale Salad", ["kale"], [], 15), r("Kale Pasta", ["kale"], [], 60)];
    const dates = ["2026-11-23", "2026-11-24", "2026-11-25"];
    for (const seed of [1, 2, 3, 4]) {
      const plan = planWeek({ catalog, dates, kidNights: 0, quick: ["2026-11-24"], seed });
      expect(plan.nights.find((n) => n.date === "2026-11-24")!.recipeId).toBe("kale-salad");
      expect(plan.shortOnQuick).toBe(false);
    }
  });
});

describe("season edge cases", () => {
  it("doesn't confuse grilled cheese, chili-dusted fish or chilled ramen", () => {
    expect(recipeSeasons(r("Fontina & Beet Grilled Cheese Sandwiches"))).toEqual([]);
    expect(recipeSeasons(r("Chili-Dusted Fish Tacos"))).toEqual([]);
    expect(recipeSeasons(r("Chilled Vegetable Ramen"))).toEqual(["summer"]);
    expect(recipeSeasons(r("Turkey Chili"))).toEqual(["cold"]);
  });
});
