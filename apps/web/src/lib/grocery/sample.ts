/**
 * A made-up week for the grocery page when Supabase isn't configured (local
 * previews and screenshots).
 */
import { addDays } from "../chef/dates";
import { parseIngredientLine } from "../ingredient-line";
import type { GroceryWeek } from "../chef/store";
import { extraKey, type GroceryMeal } from "./list";

const MEALS: [number, string, string[], number?][] = [
  [0, "Kale & Jack Quesadillas", ["1 bunch dino kale", "4 scallions", "8 oz monterey jack", "6 flour tortillas", "1 lime", "1 tbsp olive oil", "Salt to taste"], 2],
  [1, "Miso & Shiitake Ramen", ["6 oz shiitake mushrooms", "3 scallions, sliced", "2 tbsp white miso", "8 oz ramen noodles", "4 cups chicken stock", "2 pasture-raised eggs", "1 tbsp soy sauce", "1 Tbsp Asian-style aromatics", "1 tsp sesame seeds"]],
  [2, "Chicken Piccata", ["1 lb chicken breast", "1 lemon", "2 tbsp capers, rinsed", "2 tbsp butter", "1/4 cup flour", "1/2 cup chicken stock", "8 oz linguine", "plus 1/8 teaspoon salt"], 2],
  [3, "Pesto Pasta & Lemon Ricotta", ["8 oz rigatoni", "1/2 cup basil pesto", "1/2 cup ricotta", "2 cups baby spinach", "1 lemon", "2 tbsp pine nuts"]],
  [4, "Spicy Veracruz-Style Shrimp", ["1 lb shrimp", "1 can diced tomatoes", "1/4 cup green olives", "1 tbsp capers", "1 jalapeño", "1/2 bunch cilantro", "1 cup jasmine rice", "1 white onion"]],
  [5, "Shiitake & Kale Fried Rice", ["2 cups cooked jasmine rice", "8 oz cremini mushrooms", "2 cups kale, chopped", "2 large eggs", "2 scallions", "1 tbsp sesame oil"]],
];

export function sampleGroceryWeek(weekStart: string): GroceryWeek {
  const meals: GroceryMeal[] = MEALS.map(([day, title, raws, scale], i) => ({
    id: `sample-${i}`,
    date: addDays(weekStart, day),
    meal: day === 5 ? "lunch" : "dinner",
    title,
    scale: scale ?? 1,
    lines: raws.map((raw) => ({ raw, ...parseIngredientLine(raw) })),
  }));
  return {
    meals,
    marks: [
      { key: "scallion", label: null, aisle: null, checked: true, checkedBy: "Joe" },
      { key: "lemon", label: null, aisle: null, checked: true, checkedBy: "Sam" },
      { key: "shiitake mushroom", label: null, aisle: null, checked: true, checkedBy: "Joe" },
      { key: extraKey("Paper towels"), label: "paper towels", aisle: null, checked: false },
      { key: extraKey("Oat milk"), label: "oat milk", aisle: null, checked: false },
    ],
    ready: true,
  };
}
