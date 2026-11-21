import { describe, expect, it } from "vitest";
import { formatAmount, formatIngredientLine, matchKey, normalizeUnit, parseAmount, parseIngredientLine } from "./ingredient-line";

describe("parseIngredientLine", () => {
  const cases: [string, ReturnType<typeof parseIngredientLine>][] = [
    ["1 shredded carrot", { quantity: 1, unit: "each", name: "carrot", prep: "shredded" }],
    ["1 carrot, shredded", { quantity: 1, unit: "each", name: "carrot", prep: "shredded" }],
    ["1 1/2 Tbsp. capers, rinsed", { quantity: 1.5, unit: "tbsp", name: "capers", prep: "rinsed" }],
    ["½ cup chicken stock", { quantity: 0.5, unit: "cup", name: "chicken stock", prep: null }],
    ["1½ cups flour", { quantity: 1.5, unit: "cup", name: "flour", prep: null }],
    ["6 Tbsp cold unsalted butter, cut into pieces", { quantity: 6, unit: "tbsp", name: "unsalted butter", prep: "cold, cut into pieces" }],
    ["1 small white onion, finely chopped (about 1 cup)", { quantity: 1, unit: "each", name: "white onion", prep: "small, finely chopped, about 1 cup" }],
    ["2-3 cloves garlic, minced", { quantity: 2, unit: "clove", name: "garlic", prep: "minced" }],
    ["2 each Scallions", { quantity: 2, unit: "each", name: "scallions", prep: null }],
    ["1/4 CUP OLIVE OIL", { quantity: 0.25, unit: "cup", name: "olive oil", prep: null }],
    ["1 (15-oz) can chickpeas, drained", { quantity: 1, unit: "can", name: "chickpeas", prep: "drained, 15-oz" }],
    ["1 15-oz can black beans", { quantity: 1, unit: "can", name: "black beans", prep: "15-oz" }],
    ["Salt and pepper to taste", { quantity: null, unit: "to taste", name: "salt and pepper", prep: null }],
    ["a pinch of red pepper flakes", { quantity: 1, unit: "pinch", name: "red pepper flakes", prep: null }],
    ["2 skin-on salmon fillets", { quantity: 2, unit: "each", name: "salmon fillets", prep: "skin-on" }],
    ["8 fl oz whole milk", { quantity: 8, unit: "fl oz", name: "whole milk", prep: null }],
    ["Taco toppings of your choice", { quantity: null, unit: null, name: "taco toppings of your choice", prep: null }],
  ];
  it.each(cases)("%s", (line, parts) => expect(parseIngredientLine(line)).toEqual(parts));
});

describe("amounts and units", () => {
  it("reads fractions", () => {
    expect(parseAmount("1 1/2")).toBe(1.5);
    expect(parseAmount("¾")).toBe(0.75);
    expect(parseAmount("2½")).toBe(2.5);
    expect(parseAmount(".5")).toBe(0.5);
    expect(parseAmount("1/0")).toBeNull();
    expect(parseAmount("some")).toBeNull();
  });
  it("writes fractions", () => {
    expect(formatAmount(1.5)).toBe("1 1/2");
    expect(formatAmount(0.33)).toBe("1/3");
    expect(formatAmount(2)).toBe("2");
    expect(formatAmount(1.15)).toBe("1.15");
  });
  it("maps unit spellings", () => {
    expect(normalizeUnit("Tablespoons")).toBe("tbsp");
    expect(normalizeUnit("T")).toBe("tbsp");
    expect(normalizeUnit("t")).toBe("tsp");
    expect(normalizeUnit("lbs.")).toBe("lb");
    expect(normalizeUnit("handful")).toBeNull();
  });
});

describe("formatIngredientLine", () => {
  it("rebuilds lines", () => {
    expect(formatIngredientLine({ quantity: 1.5, unit: "tbsp", name: "capers", prep: "rinsed" })).toBe("1 1/2 tbsp capers, rinsed");
    expect(formatIngredientLine({ quantity: 1, unit: "each", name: "carrot", prep: "shredded" })).toBe("1 carrot, shredded");
    expect(formatIngredientLine({ quantity: null, unit: "to taste", name: "salt", prep: null })).toBe("salt, to taste");
  });
});

describe("matchKey", () => {
  it("treats plurals and case as the same food", () => {
    expect(matchKey("Shallots")).toBe(matchKey("shallot"));
    expect(matchKey("Tomatoes")).toBe(matchKey("tomato"));
    expect(matchKey("Cherries")).toBe(matchKey("cherry"));
    expect(matchKey("Crème Fraîche")).toBe("creme fraiche");
    expect(matchKey("Swiss")).toBe("swiss");
    expect(matchKey("Grass")).toBe("grass");
  });
});

describe("messier lines from the import", () => {
  it.each([
    ["2 each Boneless, Skinless Chicken Breasts", { quantity: 2, unit: "each", name: "chicken breasts", prep: "boneless skinless" }],
    ["2 garlic cloves, peeled and roughly chopped", { quantity: 2, unit: "clove", name: "garlic", prep: "peeled and roughly chopped" }],
    ["1 small bunch scallions", { quantity: 1, unit: "bunch", name: "scallions", prep: "small" }],
    ["Fresh basil for serving", { quantity: null, unit: null, name: "basil", prep: "fresh, for serving" }],
    ["1 CUP CHERRY TOMATOES, HALVED", { quantity: 1, unit: "cup", name: "cherry tomatoes", prep: "halved" }],
  ] as const)("%s", (line, parts) => expect(parseIngredientLine(line)).toEqual(parts));
});
