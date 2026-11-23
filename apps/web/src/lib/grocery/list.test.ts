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
    expect(scallions.amount).toBeNull(); // bought by the bunch
    expect(scallions.uses.map((u) => u.date)).toEqual(["2026-11-30", "2026-12-01"]);
    expect(produce.items.find((i) => i.key === "dino kale")?.amount).toBeNull();
    expect(produce.items.find((i) => i.key === "shiitake mushroom")?.amount).toBe("8 oz"); // 4 oz doubled
  });

  it("groups by aisle in store order and asks about pantry items first", () => {
    const list = buildGroceryList(week);
    expect(list.sections.map((s) => s.aisle)).toEqual(["produce", "bakery", "cheese", "dairy"]);
    expect(list.pantryCheck.map((i) => i.name)).toEqual(["Garlic", "Kalamata olives", "Olive oil", "Salt & pepper", "White miso"]);
    expect(list.pantryCheck.map((i) => i.aisle)).toEqual(["produce", "pantry", "pantry", "baking", "international"]);
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
    expect(list.pantryCheck.map((i) => [i.name, i.aisle, i.amount])).toEqual([["Canned tomatoes", "pantry", null]]);
    expect(list.sections.find((s) => s.aisle === "produce")?.items.map((i) => [i.name, i.amount])).toEqual([["Tomatoes", "×2"]]);
  });

  it("shops for simple names, splits aromatics, and doesn't list stray amounts", () => {
    const list = buildGroceryList([
      meal("m1", "2026-11-30", "Stir Fry", ["1 Tbsp Asian-style aromatics", "2 scallions", "plus 1/8 teaspoon salt", "2 pasture-raised eggs", "4 oz cremini mushrooms", "4 oz shiitake mushrooms"]),
      meal("m2", "2026-12-01", "Omelet", ["3 large eggs", "Kosher salt and black pepper", "1/2 lb button mushrooms"]),
    ]);
    const all = [...list.sections.flatMap((s) => s.items), ...list.pantryCheck];
    const names = all.map((i) => i.name).sort();
    expect(names).toEqual(["Eggs", "Garlic", "Ginger", "Mushrooms", "Salt & pepper", "Scallions", "Shiitake mushrooms"]);
    expect(all.find((i) => i.name === "Scallions")?.uses.map((u) => u.title)).toEqual(["Stir Fry"]);
    expect(all.find((i) => i.name === "Salt & pepper")?.amount).toBeNull();
    expect(all.find((i) => i.name === "Eggs")?.uses).toHaveLength(2);
    expect(all.find((i) => i.name === "Mushrooms")?.amount).toBe("12 oz");
  });

  it("asks about pantry and multi-use items, and moves them on have or need", () => {
    const m = meal("m1", "2026-11-30", "Fried Rice", ["2 Tbsp soy sauce", "1 cup jasmine rice", "1 Tbsp Calabrian chili paste", "2 eggs", "2 carrots"]);
    let list = buildGroceryList([m]);
    expect(list.pantryCheck.map((i) => i.name)).toEqual(["Calabrian chili paste", "Eggs", "Jasmine rice", "Soy sauce"]);
    expect(list.sections.flatMap((s) => s.items).map((i) => i.name)).toEqual(["Carrots"]);
    list = buildGroceryList([m], [
      { key: "soy sauce", label: null, aisle: null, checked: false, status: "have" },
      { key: "egg", label: null, aisle: null, checked: false, status: "need" },
      { key: "carrot", label: null, aisle: null, checked: false, status: "have" },
    ]);
    expect(list.have.map((i) => i.name)).toEqual(["Carrots", "Soy sauce"]);
    expect(list.sections.find((s) => s.aisle === "dairy")?.items.map((i) => i.name)).toEqual(["Eggs"]);
    expect(list.pantryCheck.map((i) => i.name)).toEqual(["Calabrian chili paste", "Jasmine rice"]);
    expect(list.total).toBe(1);
    expect(groceryText(list)).toMatch(/Already have \(not shopping for\): Carrots, Soy sauce/);
  });

  it("is empty with no meals, and says so", () => {
    const list = buildGroceryList([]);
    expect(list.total).toBe(0);
    expect(groceryText(list)).toMatch(/empty/);
    expect(groceryText(buildGroceryList(week))).toMatch(/^\d+ items to buy for 3 meals/);
  });
});
