import { describe, expect, it } from "vitest";
import { defaultTier, tierOf } from "./ingredient-tier";

describe("defaultTier", () => {
  it.each([
    // Joe's list: fresh vegetables
    ["mushrooms", "use_up"], ["cremini mushrooms", "use_up"], ["carrots", "use_up"], ["baby spinach", "use_up"], ["dino kale", "use_up"],
    ["broccoli", "use_up"], ["scallions", "use_up"], ["sweet peppers", "use_up"], ["cilantro", "use_up"],
    // Pricey condiments and cheeses
    ["basil pesto", "use_up"], ["black bean chili oil", "use_up"], ["mole sauce", "use_up"], ["goat cheese", "use_up"],
    ["mascarpone cheese", "use_up"], ["sun-dried tomatoes", "use_up"],
    // Multi-meal protein packs
    ["chicken breast", "use_up"], ["pork chops", "use_up"], ["beef", "use_up"], ["tofu", "use_up"], ["ground turkey", "use_up"],
    // Fresh dairy that spoils fast
    ["heavy cream", "use_up"], ["half-and-half", "use_up"], ["cream", "use_up"],
    // Pricey but keeps for months: share across weeks
    ["walnuts", "stock_up"], ["chopped pecans", "stock_up"], ["golden raisins", "stock_up"], ["pine nuts", "stock_up"],
    ["dried cranberries", "stock_up"], ["toasted almonds", "stock_up"],
    // Pantry: worth finishing, but second
    ["capers", "pantry"], ["kalamata olives", "pantry"], ["calabrian chile paste", "pantry"], ["parmesan cheese", "pantry"], ["sour cream", "pantry"], ["tomato paste", "pantry"], ["flour tortillas", "pantry"], ["pickled jalapeño peppers", "pantry"],
    // Cheap or always on hand
    ["lemon", "ignore"], ["lime", "ignore"], ["garlic", "ignore"], ["yellow onion", "ignore"], ["red onion", "ignore"], ["shallot", "ignore"],
    ["butter", "ignore"], ["garlic powder", "ignore"], ["crushed red pepper flakes", "ignore"], ["olive oil", "ignore"], ["kosher salt", "ignore"],
    ["freshly ground black pepper", "ignore"], ["lemon juice", "ignore"], ["eggs", "ignore"],
    ["ketchup", "ignore"], ["mayonnaise", "ignore"], ["mayo", "ignore"], ["ground cumin", "ignore"], ["almond extract", "ignore"], ["cream cheese", "pantry"],
  ])("%s → %s", (name, tier) => {
    expect(defaultTier(name)).toBe(tier);
  });

  it("falls back on the perishable flag for names it doesn't know", () => {
    expect(defaultTier("purple yam", true)).toBe("use_up");
    expect(defaultTier("furikake", false)).toBe("ignore");
  });

  it("lets the household's choice win", () => {
    expect(tierOf("lemon", true, "use_up")).toBe("use_up");
    expect(tierOf("kale", true, "ignore")).toBe("ignore");
    expect(tierOf("kale", true, null)).toBe("use_up");
  });
});

describe("radishes", () => {
  it("are a use-up vegetable, daikon too", () => {
    for (const name of ["radish", "radishes", "watermelon radish", "french breakfast radishes", "daikon", "daikon radish"]) {
      expect(tierOf(name, false, null)).toBe("use_up");
    }
  });
});
