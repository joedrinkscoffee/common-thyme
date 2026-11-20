import type { RecipeDetail } from "./recipes";

/** Shown when Supabase isn't configured, so the recipe pages can be reviewed on their own. */
export const sampleRecipes: RecipeDetail[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Chicken Piccata",
    photoUrl: null,
    tags: ["Italian"],
    totalMinutes: 35,
    stepsReconstructed: true,
    sourceUrl: "https://www.blueapron.com/recipes/chicken-piccata",
    servings: 2,
    notes: null,
    ingredients: [
      { raw: "2 chicken cutlets", perishable: true },
      { raw: "1 lemon", perishable: true },
      { raw: "1 tbsp capers, rinsed", perishable: true },
      { raw: "2 tbsp butter", perishable: true },
      { raw: "¼ cup flour", perishable: false },
      { raw: "½ cup chicken stock", perishable: false },
    ],
    steps: [
      { title: "Prep the chicken", body: "Pat the cutlets dry, season with salt and pepper, and dredge in the flour." },
      { title: "Sear", body: "Heat a drizzle of oil over medium-high. Cook the chicken 3 to 4 minutes per side until golden. Move to a plate." },
      { title: "Make the sauce", body: "Add the stock, capers and the juice of the lemon to the pan. Simmer 2 minutes, then stir in the butter." },
      { title: "Serve", body: "Return the chicken to the pan, spoon the sauce over and serve." },
    ],
  },
  ...[
    ["Calabrian Shrimp & Orzo", "Seafood", 30],
    ["Kale & Jack Quesadillas", "Mexican", 25],
    ["Pesto Pasta & Lemon Ricotta", "Italian", 25],
    ["Feta & Olive Pizza", "Pizza", 40],
    ["Miso & Shiitake Ramen", "Asian", 35],
    ["Spicy Veracruz-Style Shrimp", "Seafood", 30],
    ["Cheddar & Spicy Red Onion Burgers", "Sandwiches & Burgers", 40],
  ].map(([title, tag, minutes], n) => ({
    id: `00000000-0000-4000-8000-00000000000${n + 2}`,
    title: title as string,
    photoUrl: null,
    tags: [tag as string],
    totalMinutes: minutes as number,
    stepsReconstructed: false,
    sourceUrl: null,
    servings: 2,
    notes: null,
    ingredients: [],
    steps: [],
  })),
];
