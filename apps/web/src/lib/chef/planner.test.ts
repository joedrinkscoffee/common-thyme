import { describe, expect, it } from "vitest";
import { overlapScore, planWeek, type CatalogRecipe } from "./planner";

const r = (id: string, perishables: string[], tags: string[] = []): CatalogRecipe => ({ id, title: id, tags, totalMinutes: 30, perishables });

const catalog = [
  r("piccata", ["lemon", "caper", "chicken"], ["kid friendly"]),
  r("orzo", ["lemon", "caper", "shrimp"]),
  r("pesto", ["lemon", "ricotta", "basil"], ["kid friendly"]),
  r("quesadilla", ["kale", "jack"], ["kid friendly"]),
  r("ramen", ["kale", "shiitake", "scallion"]),
  r("tacos", ["cilantro", "fish", "cabbage"]),
  r("curry", ["coconut", "spinach", "chili"]),
  r("burger", ["beef", "onion", "cheddar"], ["kid friendly"]),
];
const week = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"];

describe("planWeek", () => {
  it("picks dinners that share perishables over ones that don't", () => {
    const result = planWeek({ catalog, dates: week, kidNights: 0, seed: 1 });
    const ids = result.nights.map((n) => n.recipeId);
    expect(ids).toEqual(expect.arrayContaining(["piccata", "orzo", "pesto"]));
    expect(ids).not.toContain("tacos");
    expect(ids).not.toContain("curry");
    expect(result.shared[0]).toEqual({ name: "lemon", nights: 3 });
  });

  it("fills every night with a different recipe, in date order", () => {
    const result = planWeek({ catalog, dates: week, kidNights: 0, seed: 5 });
    expect(result.nights.map((n) => n.date)).toEqual(week);
    expect(new Set(result.nights.map((n) => n.recipeId)).size).toBe(4);
  });

  it("puts dinners that share ingredients next to each other", () => {
    const result = planWeek({ catalog, dates: week, kidNights: 0, keep: ["quesadilla", "ramen"], seed: 2 });
    const order = result.nights.map((n) => n.recipeId);
    expect(Math.abs(order.indexOf("quesadilla") - order.indexOf("ramen"))).toBe(1);
  });

  it("gives the kids' nights to kid friendly recipes", () => {
    const result = planWeek({ catalog, dates: week, kidNights: 2, seed: 4 });
    const kidNights = result.nights.filter((n) => n.sharedWithKids);
    expect(kidNights).toHaveLength(2);
    for (const n of kidNights) expect(catalog.find((c) => c.id === n.recipeId)!.tags).toContain("kid friendly");
  });

  it("keeps and avoids what it's told", () => {
    const result = planWeek({ catalog, dates: week, kidNights: 0, keep: ["tacos"], avoid: ["piccata"], seed: 1 });
    const ids = result.nights.map((n) => n.recipeId);
    expect(ids).toContain("tacos");
    expect(ids).not.toContain("piccata");
  });

  it("skips recent recipes unless there aren't enough others", () => {
    const fresh = planWeek({ catalog, dates: week.slice(0, 2), kidNights: 0, recent: ["piccata", "orzo"], seed: 1 });
    expect(fresh.nights.map((n) => n.recipeId)).not.toContain("piccata");
    const tight = planWeek({ catalog: catalog.slice(0, 3), dates: week.slice(0, 3), kidNights: 0, recent: ["piccata"], seed: 1 });
    expect(tight.nights).toHaveLength(3);
  });

  it("gives a different week for a different seed", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      seen.add(planWeek({ catalog, dates: week.slice(0, 3), kidNights: 0, seed }).nights.map((n) => n.recipeId).sort().join());
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("scores shared perishables up and one-offs down", () => {
    expect(overlapScore([catalog[0], catalog[1]])).toBeGreaterThan(overlapScore([catalog[0], catalog[5]]));
  });
});
