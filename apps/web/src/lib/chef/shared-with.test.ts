import { describe, expect, it } from "vitest";
import type { HomeDinner } from "./brief";
import { sharedFor, sharedWithWeek } from "./shared-with";

const meal = (id: string, useUp: string[], status: HomeDinner["status"] = "planned"): HomeDinner => ({
  id,
  date: "2026-11-23",
  meal: "dinner",
  recipeId: id,
  title: id,
  photoUrl: null,
  sharedWithKids: false,
  status,
  useUp,
});

describe("sharedWithWeek", () => {
  it("lists the use-up ingredients other meals in the week also use", () => {
    const pasta = meal("pasta", ["spinach", "pesto", "ricotta"]);
    const orzo = meal("orzo", ["shrimp", "spinach"]);
    const pizza = meal("pizza", ["pesto"]);
    const ramen = meal("ramen", ["shiitake"]);
    expect(sharedWithWeek(pasta, [pasta, orzo, pizza, ramen])).toEqual([
      { key: "spinach", with: [orzo] },
      { key: "pesto", with: [pizza] },
    ]);
    expect(sharedWithWeek(ramen, [pasta, orzo, pizza, ramen])).toEqual([]);
  });

  it("ignores skipped meals", () => {
    const a = meal("a", ["kale"]);
    expect(sharedWithWeek(a, [a, meal("b", ["kale"], "skipped")])).toEqual([]);
  });
});

describe("sharedFor", () => {
  const shared = [{ key: "spinach", with: [] }, { key: "chicken breast", with: [] }];
  it("matches the base ingredient inside a longer name", () => {
    expect(sharedFor("baby spinach", "", shared)?.key).toBe("spinach");
    expect(sharedFor("boneless chicken breasts", "", shared)?.key).toBe("chicken breast");
    expect(sharedFor(null, "1 bunch spinach", shared)?.key).toBe("spinach");
    expect(sharedFor("lemon", "", shared)).toBeNull();
  });
});
