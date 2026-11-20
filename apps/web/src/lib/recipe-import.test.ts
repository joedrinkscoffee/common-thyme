import { describe, expect, it } from "vitest";
import { parseImportFile, parseRecipe, photoExtension } from "./recipe-import";

const base = { origin: "airtable", ref: "rec1", title: "Chicken Piccata" };

describe("parseRecipe", () => {
  it("cleans up a recipe and fills defaults", () => {
    const r = parseRecipe({
      ...base,
      title: "  Chicken Piccata ",
      sourceUrl: "https://example.com/piccata",
      photoUrl: "javascript:alert(1)",
      servings: 0,
      totalMinutes: 35.4,
      tags: ["Italian", "", 4],
      ingredients: [
        { raw: "2 lemons", name: "Lemon", quantity: 2, unit: null, perishable: true },
        { raw: "  " },
        { raw: "Salt" },
      ],
      steps: [{ title: "Cook the chicken", body: "Season and sear." }, { body: "" }],
    });
    expect(r).toEqual({
      origin: "airtable",
      ref: "rec1",
      title: "Chicken Piccata",
      sourceUrl: "https://example.com/piccata",
      photoUrl: null,
      totalMinutes: 35,
      servings: 2,
      tags: ["Italian"],
      stepsReconstructed: false,
      notes: null,
      ingredients: [
        { raw: "2 lemons", name: "Lemon", quantity: 2, unit: null, perishable: true },
        { raw: "Salt", name: null, quantity: null, unit: null, perishable: false },
      ],
      steps: [{ title: "Cook the chicken", body: "Season and sear." }],
    });
  });

  it("explains what's wrong with a bad recipe", () => {
    expect(parseRecipe(null)).toBe("not a recipe");
    expect(parseRecipe({ origin: "airtable", ref: "x" })).toBe("missing a title");
    expect(parseRecipe({ title: "Tacos", origin: "somewhere", ref: "x" })).toBe('"Tacos" is missing where it came from');
  });
});

describe("parseImportFile", () => {
  it("keeps good recipes, skips duplicates and reports problems", () => {
    const text = JSON.stringify({ recipes: [base, { ...base, title: "Again" }, { title: "No source" }] });
    const result = parseImportFile(text);
    expect(result.recipes.map((r) => r.title)).toEqual(["Chicken Piccata"]);
    expect(result.problems).toEqual([
      '"Again" appears twice; kept the first one',
      'Recipe 3: "No source" is missing where it came from',
    ]);
  });

  it("rejects files that aren't an import", () => {
    expect(parseImportFile("nope").problems).toEqual(["That file isn't valid JSON."]);
    expect(parseImportFile("{}").problems).toEqual(["That file has no recipes list."]);
  });
});

describe("photoExtension", () => {
  it("only accepts image types", () => {
    expect(photoExtension("image/jpeg; charset=binary")).toBe("jpg");
    expect(photoExtension("image/webp")).toBe("webp");
    expect(photoExtension("application/pdf")).toBeNull();
    expect(photoExtension(null)).toBeNull();
  });
});
