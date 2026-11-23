import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { ChefSession } from "./session";
import { buildGroceryList } from "../grocery/list";

const TODAY = "2026-11-26"; // Thursday

async function setup() {
  const store = new MemoryStore([
    { id: "quesadilla", title: "Kale Quesadillas", tags: [], totalMinutes: 25, useUp: ["kale", "scallion"], servings: 2, ingredients: ["1 bunch kale", "4 scallions", "4 flour tortillas", "1 tbsp olive oil"] },
    { id: "ramen", title: "Ramen", tags: [], totalMinutes: 30, useUp: ["scallion"], servings: 2, ingredients: ["2 scallions", "8 oz ramen noodles", "2 garlic cloves"] },
  ]);
  const plan = await store.ensurePlan("2026-11-30");
  await store.addDinner({ planId: plan.id, date: "2026-11-30", recipeId: "quesadilla", sharedWithKids: false, servings: 2 });
  await store.addDinner({ planId: plan.id, date: "2026-12-01", recipeId: "ramen", sharedWithKids: true, servings: 4 });
  const session = new ChefSession(store, TODAY);
  await session.load();
  return { store, session };
}

describe("grocery_list", () => {
  it("reads the week's list, links it, and scales to the servings planned", async () => {
    const { session } = await setup();
    const out = await session.groceryListTool({ week_start: "2026-11-30" });
    expect(out.ok).toBe(true);
    expect(out.text).toMatch(/Scallions(,| \(✓|$)/m); // 4 + 2 doubled
    expect(out.text).toContain("Not yet asked whether they have these on hand: Garlic, Ramen noodles");
    expect(session.groceryWeek).toBe("2026-11-30");
    expect(session.changes).toEqual([]);
  });

  it("adds things by hand and checks off what they have", async () => {
    const { store, session } = await setup();
    const out = await session.groceryListTool({ week_start: "2026-11-30", add: ["Paper towels"], check: ["kale", "durian"] });
    expect(out.text).toContain("Added paper towels.");
    expect(out.text).toContain("Checked off kale.");
    expect(out.text).toContain('"durian" isn\'t on the list.');
    const week = await store.groceryWeek("2026-11-30");
    const list = buildGroceryList(week.meals, week.marks);
    expect(list.sections.flatMap((s) => s.items).find((i) => i.key === "kale")?.checked).toBe(true);
    expect(list.sections.find((s) => s.aisle === "other")?.items.map((i) => i.name)).toEqual(["Paper towels"]);
    expect(session.changes).toEqual(["Updated the grocery list for the week of Nov 30"]);
  });

  it("marks what they already have, and what they're out of", async () => {
    const { store, session } = await setup();
    const out = await session.groceryListTool({ week_start: "2026-11-30", have: ["ramen noodles", "scallions"], need: ["garlic"] });
    expect(out.ok).toBe(true);
    expect(out.text).toContain("Marked ramen noodles as already on hand.");
    expect(out.text).toContain("Put garlic on the list to buy.");
    const week = await store.groceryWeek("2026-11-30");
    const list = buildGroceryList(week.meals, week.marks);
    expect(list.have.map((i) => i.key)).toEqual(["ramen noodle", "scallion"]);
    expect(list.sections.find((s) => s.aisle === "produce")?.items.map((i) => i.key)).toContain("garlic");
    expect(list.pantryCheck).toEqual([]);
  });

  it("rejects weeks that aren't Mondays or are over", async () => {
    const { session } = await setup();
    expect((await session.groceryListTool({ week_start: "2026-12-01" })).ok).toBe(false);
    expect((await session.groceryListTool({ week_start: "2026-11-16" })).ok).toBe(false);
  });

  it("locking in a week links its list", async () => {
    const { session } = await setup();
    const out = await session.lockWeekTool({ week_start: "2026-11-30" });
    expect(out.text).toMatch(/grocery list is ready/);
    expect(session.groceryWeek).toBe("2026-11-30");
  });
});

describe("set_grocery_aisle", () => {
  it("moves an ingredient out of the pantry check, and back", async () => {
    const { store, session } = await setup();
    const out = await session.setGroceryAisleTool({ ingredient: "garlic", aisle: "produce" });
    expect(out).toEqual({ ok: true, text: 'garlic is now under "Produce" on grocery lists.' });
    let week = await store.groceryWeek("2026-11-30");
    expect(buildGroceryList(week.meals).sections.find((s) => s.aisle === "produce")?.items.some((i) => i.key === "garlic")).toBe(true);
    await session.setGroceryAisleTool({ ingredient: "garlic", aisle: "default" });
    week = await store.groceryWeek("2026-11-30");
    expect(buildGroceryList(week.meals).pantryCheck.some((i) => i.key === "garlic")).toBe(true);
    expect((await session.setGroceryAisleTool({ ingredient: "garlic", aisle: "aisle 9" })).ok).toBe(false);
    expect((await session.setGroceryAisleTool({ ingredient: "saffron", aisle: "baking" })).ok).toBe(false);
  });
});
