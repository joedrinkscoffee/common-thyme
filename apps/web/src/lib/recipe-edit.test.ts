import { describe, expect, it } from "vitest";
import { validateRecipeEdit, type RecipeEditInput } from "./recipe-edit";

const base: RecipeEditInput = {
  title: "  Carrot   Salad ",
  sourceUrl: "",
  totalMinutes: "20",
  servings: 2,
  tags: ["Salad", "salad", " quick "],
  notes: "",
  stepsReconstructed: false,
  ingredients: [
    { amount: "1 1/2", unit: "cup", name: "Carrot", prep: "Shredded", ingredientId: null },
    { amount: "", unit: "to taste", name: "salt", prep: "", ingredientId: null },
    { amount: "", unit: "", name: "", prep: "", ingredientId: null },
  ],
  steps: [
    { title: "", body: "Toss everything together." },
    { title: "", body: "" },
  ],
};

describe("validateRecipeEdit", () => {
  it("cleans up a good recipe", () => {
    const r = validateRecipeEdit(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipe.title).toBe("Carrot Salad");
    expect(r.recipe.sourceUrl).toBeNull();
    expect(r.recipe.totalMinutes).toBe(20);
    expect(r.recipe.tags).toEqual(["Salad", "quick"]);
    expect(r.recipe.ingredients).toEqual([
      { quantity: 1.5, unit: "cup", name: "carrot", prep: "shredded", ingredientId: null, rawText: "1 1/2 cup carrot, shredded" },
      { quantity: null, unit: "to taste", name: "salt", prep: null, ingredientId: null, rawText: "salt, to taste" },
    ]);
    expect(r.recipe.steps).toEqual([{ title: null, body: "Toss everything together." }]);
  });

  it("adds https to bare links and refuses other kinds", () => {
    const ok = validateRecipeEdit({ ...base, sourceUrl: "smittenkitchen.com/carrots" });
    expect(ok.ok && ok.recipe.sourceUrl).toBe("https://smittenkitchen.com/carrots");
    const bad = validateRecipeEdit({ ...base, sourceUrl: "javascript:alert(1)" });
    expect(!bad.ok && bad.errors.sourceUrl).toBeTruthy();
  });

  it("checks units and amounts on each row", () => {
    const r = validateRecipeEdit({
      ...base,
      ingredients: [
        { amount: "2", unit: "handful", name: "spinach", prep: "", ingredientId: null },
        { amount: "", unit: "tbsp", name: "butter", prep: "", ingredientId: null },
        { amount: "lots", unit: "cup", name: "rice", prep: "", ingredientId: null },
        { amount: "1", unit: "each", name: "", prep: "", ingredientId: null },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toMatchObject({
      "ingredients.0.unit": "Pick a unit.",
      "ingredients.1.amount": "How much?",
      "ingredients.2.amount": expect.stringContaining("number"),
      "ingredients.3.name": "Which ingredient?",
    });
  });

  it("needs a title, an ingredient and a step", () => {
    const r = validateRecipeEdit({ ...base, title: " ", ingredients: [], steps: [], servings: 30, totalMinutes: "abc" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["ingredients", "servings", "steps", "title", "totalMinutes"]);
  });
});
