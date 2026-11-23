import { describe, expect, it } from "vitest";
import { buildGroceryList, shoppingAmount, extraKey, groceryText, type GroceryMeal } from "./list";
import { parseIngredientLine } from "../ingredient-line";

const meal = (id: string, date: string, title: string, raws: string[], scale = 1): GroceryMeal => ({
  id,
  date,
  meal: "dinner",
  title,
  scale,
  lines: raws.map((raw) => ({ raw, ...parseIngredientLine(raw) })),
});

describe("shoppingAmount", () => {
  it("gives proteins and vegetables a weight", () => {
    expect(shoppingAmount([{ quantity: 12, unit: "oz" }, { quantity: 1, unit: "lb" }], "meat")).toBe("1 3/4 lb");
    expect(shoppingAmount([{ quantity: 4, unit: "oz" }, { quantity: 6, unit: "oz" }], "produce")).toBe("10 oz");
  });
  it("counts whole things, and only says so past one", () => {
    expect(shoppingAmount([{ quantity: 1, unit: "each" }, { quantity: 1.5, unit: null }], "produce")).toBe("×3");
    expect(shoppingAmount([{ quantity: 1, unit: "each" }], "produce")).toBeNull();
    expect(shoppingAmount([{ quantity: 0.5, unit: "bunch" }], "produce")).toBeNull();
    expect(shoppingAmount([{ quantity: 2, unit: "can" }], "pantry")).toBe("×2");
  });
  it("never shows cups or spoons", () => {
    expect(shoppingAmount([{ quantity: 2, unit: "cup" }], "produce")).toBeNull();
    expect(shoppingAmount([{ quantity: 1, unit: "bunch" }, { quantity: 2, unit: "cup" }], "produce")).toBeNull();
    expect(shoppingAmount([{ quantity: 0.5, unit: "cup" }], "pantry")).toBeNull();
    expect(shoppingAmount([{ quantity: 8, unit: "oz" }], "grains")).toBeNull();
  });
  it("leaves eggs, milk and cream without an amount", () => {
    expect(shoppingAmount([{ quantity: 4, unit: "each" }], "dairy")).toBeNull();
    expect(shoppingAmount([{ quantity: 1, unit: "cup" }], "dairy")).toBeNull();
  });
});

describe("buildGroceryList", () => {
  const week = [
    meal("m1", "2026-11-30", "Kale & Jack Quesadillas", ["1 bunch dino kale", "4 scallions", "8 oz monterey jack", "4 flour tortillas", "1 tbsp olive oil"]),
    meal("m2", "2026-12-02", "Feta & Olive Pizza", ["2 cups kale, chopped", "1 lb pizza dough", "4 oz feta", "1/4 cup kalamata olives", "Salt to taste"]),
    meal("m3", "2026-12-01", "Miso Ramen", ["2 scallions, sliced", "4 oz shiitake mushrooms", "2 tbsp white miso", "2 garlic cloves"], 2),
  ];

  it("combines an ingredient across recipes, scaled to the servings planned", () => {
    const list = buildGroceryList(week);
    const produce = list.sections.find((s) => s.aisle === "produce")!;
    const scallions = produce.items.find((i) => i.key === "scallion")!;
    expect(scallions.amount).toBe("×8"); // 4 + 2 doubled
    expect(scallions.uses.map((u) => u.date)).toEqual(["2026-11-30", "2026-12-01"]);
    const kale = produce.items.find((i) => i.key === "kale" || i.key === "dino kale");
    expect(kale).toBeTruthy();
  });

  it("groups by aisle in store order and keeps staples apart", () => {
    const list = buildGroceryList(week);
    expect(list.sections.map((s) => s.aisle)).toEqual(["produce", "bakery", "cheese", "dairy", "pantry", "international"]);
    expect(list.staples.map((i) => i.name)).toEqual(["Garlic", "Olive oil", "Salt"]);
    expect(list.total).toBe(list.sections.flatMap((s) => s.items).length);
  });

  it("applies the household's aisle and check marks, and adds items by hand", () => {
    const moved = week.map((m) => ({ ...m, lines: m.lines.map((l) => (l.name === "garlic" ? { ...l, aisle: "produce" } : l)) }));
    const list = buildGroceryList(moved, [
      { key: "scallion", label: null, aisle: null, checked: true, checkedBy: "Joe" },
      { key: extraKey("Paper towels"), label: "paper towels", aisle: null, checked: false },
      { key: extraKey("Oat milk"), label: "oat milk", aisle: null, checked: false },
    ]);
    const produce = list.sections.find((s) => s.aisle === "produce")!;
    expect(produce.items.some((i) => i.key === "garlic")).toBe(true);
    expect(produce.items.find((i) => i.key === "scallion")?.checked).toBe(true);
    expect(list.checked).toBe(1);
    expect(list.sections.find((s) => s.aisle === "other")?.items[0]).toMatchObject({ name: "Paper towels", extra: true });
    expect(list.sections.find((s) => s.aisle === "dairy")?.items.some((i) => i.name === "Oat milk")).toBe(true);
  });

  it("keeps canned goods apart from fresh ones, in the pantry aisle", () => {
    const list = buildGroceryList([meal("m1", "2026-11-30", "Shrimp", ["1 can diced tomatoes", "2 tomatoes"])]);
    expect(list.sections.find((s) => s.aisle === "pantry")?.items.map((i) => [i.name, i.amount])).toEqual([["Canned tomatoes", null]]);
    expect(list.sections.find((s) => s.aisle === "produce")?.items.map((i) => [i.name, i.amount])).toEqual([["Tomatoes", "×2"]]);
  });

  it("is empty with no meals, and says so", () => {
    const list = buildGroceryList([]);
    expect(list.total).toBe(0);
    expect(groceryText(list)).toMatch(/empty/);
    expect(groceryText(buildGroceryList(week))).toMatch(/^\d+ items to buy for 3 meals/);
  });
});
