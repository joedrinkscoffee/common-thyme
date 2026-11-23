import { describe, expect, it } from "vitest";
import { aisleOf, defaultAisle, soldByBunch } from "./aisles";

describe("defaultAisle", () => {
  it.each([
    // Produce, including Joe's use-up vegetables and fresh herbs
    ["mushrooms", "produce"], ["dino kale", "produce"], ["baby spinach", "produce"], ["scallions", "produce"], ["radishes", "produce"],
    ["daikon", "produce"], ["lemons", "produce"], ["red onion", "produce"], ["cilantro", "produce"], ["fresh thyme", "produce"],
    ["sugar snap peas", "produce"], ["ginger", "produce"], ["bell peppers", "produce"],
    // Meat and seafood
    ["chicken breast", "meat"], ["ground beef", "meat"], ["pork chops", "meat"], ["shrimp", "meat"], ["salmon fillets", "meat"],
    // Cheese and dairy
    ["goat cheese", "cheese"], ["parmesan", "cheese"], ["mascarpone", "cheese"], ["prosciutto", "cheese"],
    ["heavy cream", "dairy"], ["half and half", "dairy"], ["cream cheese", "dairy"], ["eggs", "dairy"], ["tofu", "dairy"], ["almond milk", "dairy"],
    // Pantry and international
    ["capers", "pantry"], ["basil pesto", "pantry"], ["sun-dried tomatoes", "pantry"], ["black bean chili oil", "pantry"],
    ["chickpeas", "pantry"], ["coconut milk", "pantry"], ["peanut butter", "pantry"], ["mole", "pantry"],
    ["fish sauce", "international"], ["white miso", "international"], ["panko", "international"],
    // Grains, bakery, nuts, frozen, drinks
    ["orzo", "grains"], ["jasmine rice", "grains"], ["egg noodles", "grains"], ["flour tortillas", "bakery"], ["naan", "bakery"],
    ["golden raisins", "nuts"], ["frozen peas", "frozen"], ["dry white wine", "drinks"],
    // Staples you probably have
    ["kosher salt", "staples"], ["black pepper", "staples"], ["salt and pepper", "staples"], ["olive oil", "staples"], ["butter", "staples"],
    ["garlic", "staples"], ["garlic cloves", "staples"], ["ketchup", "staples"], ["mayo", "staples"], ["ground cumin", "staples"],
    ["garlic powder", "staples"], ["red pepper flakes", "staples"], ["all-purpose flour", "staples"], ["soy sauce", "staples"],
    // Joe's pantry staples: sesame, soy sauce of any kind, broth, nuts
    ["sesame seeds", "staples"], ["toasted sesame oil", "staples"], ["tamari", "staples"], ["dark soy sauce", "staples"],
    ["chicken stock", "staples"], ["vegetable broth", "staples"], ["walnuts", "staples"], ["pine nuts", "staples"], ["salt & pepper", "staples"],
    // Unknown
    ["", "other"], ["mystery thing", "other"],
  ])("%s → %s", (name, aisle) => {
    expect(defaultAisle(name)).toBe(aisle);
  });

  it("uses the household's choice when there is one", () => {
    expect(aisleOf("garlic", "produce")).toBe("produce");
    expect(aisleOf("garlic", "nonsense")).toBe("staples");
    expect(aisleOf("garlic", null)).toBe("staples");
  });
});

describe("soldByBunch", () => {
  it.each([["scallions", true], ["dino kale", true], ["baby spinach", true], ["cilantro", true], ["fresh thyme", true],
    ["dried thyme", false], ["ground sage", false], ["carrots", false], ["shiitake mushrooms", false], ["lemon", false]])("%s → %s", (name, want) => {
    expect(soldByBunch(name)).toBe(want);
  });
});
