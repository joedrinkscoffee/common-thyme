/**
 * How much Chef cares about sharing an ingredient across nights.
 *
 * - use_up: fresh vegetables and herbs, pricey condiments and cheeses, and
 *   proteins that come in packs for two or more meals. Chef plans around these.
 * - stock_up: pricey to buy but keeps for months (walnuts, pecans, golden
 *   raisins). Worth finishing over several weeks, so a bag opened recently
 *   counts in its favour.
 * - pantry: keeps a while but is still worth finishing (capers, olives, chili
 *   pastes). Only breaks ties.
 * - ignore: cheap or always on hand (lemons, garlic, onions, spices, oil).
 *
 * The household can override any ingredient; this is the starting guess.
 */
import { matchKey } from "../ingredient-line";

export type ShareTier = "use_up" | "stock_up" | "pantry" | "ignore";
export const SHARE_TIERS: ShareTier[] = ["use_up", "stock_up", "pantry", "ignore"];

// Checked before everything else: pricey items whose names contain a cheap word.
const USE_UP_FIRST = ["sun dried tomato", "sundried tomato", "chili oil", "chili crisp"];

// Then shelf-stable items whose names contain a fresh word.
const PANTRY_FIRST = ["sour cream", "cream cheese", "coconut cream", "cream of", "tomato paste", "tomato sauce", "canned tomato", "crushed tomato", "diced tomato", "pickled", "tortilla", "dried mushroom", "dried shiitake"];

// Then dried fruit, before "dried" sends it to ignore.
const STOCK_UP_FIRST = ["golden raisin", "raisin", "dried cranberry", "dried cherry", "dried apricot", "dried fig", "dried date", "currant"];

// Then spices, seasonings and other cheap extras whose names
// contain a fresher-sounding word ("garlic powder", "red pepper flakes").
const IGNORE_PHRASES = [
  "powder", "flake", "seasoning", "spice", "salt", "black pepper", "ground pepper", "white pepper", "paprika", "cumin",
  "oregano", "dried", "vinegar", "sugar", "flour", "broth", "stock", "water", "olive oil", "vegetable oil", "canola oil",
  "avocado oil", "sesame oil", "cooking spray", "baking", "cornstarch", "extract", "bouillon", "cayenne", "cinnamon",
  "nutmeg", "bay leaf", "bay leaves", "coriander", "turmeric", "chili powder", "garam masala", "curry powder", "lemon juice", "lime juice",
];

const USE_UP = [
  // Fresh vegetables
  "mushroom", "shiitake", "cremini", "portobello", "carrot", "spinach", "kale", "chard", "broccoli", "broccolini", "cauliflower",
  "scallion", "green onion", "leek", "zucchini", "squash", "eggplant", "bell pepper", "sweet pepper", "poblano", "jalapeno", "jalapeño",
  "bok choy", "cabbage", "brussels sprout", "asparagus", "green bean", "snap pea", "snow pea", "pea shoot", "celery", "cucumber",
  "radish", "fennel", "arugula", "lettuce", "romaine", "mixed green", "spring mix", "corn", "tomato", "avocado", "sweet potato",
  "potato", "beet", "parsnip", "okra", "artichoke", "bean sprout",
  // Fresh herbs
  "basil", "cilantro", "parsley", "dill", "mint", "chive", "thyme", "rosemary", "sage", "tarragon", "lemongrass", "ginger",
  // Pricey condiments and cheeses
  "pesto", "chili oil", "chili crisp", "mole", "goat cheese", "chevre", "mascarpone", "sun dried tomato", "sundried tomato",
  "ricotta", "burrata", "mozzarella", "feta", "gruyere", "fontina", "brie", "blue cheese", "gorgonzola", "halloumi", "paneer",
  "creme fraiche", "crème fraîche", "heavy cream", "whipping cream", "cream", "half and half", "buttermilk", "pancetta", "prosciutto", "chorizo", "harissa", "tahini", "miso", "gochujang", "curry paste",
  // Proteins that come in multi-meal packs
  "chicken", "beef", "steak", "pork", "lamb", "turkey", "sausage", "bacon", "tofu", "tempeh", "ground", "shrimp", "salmon", "cod",
  "fish", "scallop", "halibut", "tilapia",
];

const PANTRY = [
  "caper", "olive", "chile paste", "chili paste", "sambal", "sriracha", "peppadew", "roasted red pepper", "pickled", "anchov",
  "coconut milk", "tomato paste", "canned tomato", "crushed tomato", "black bean", "chickpea", "cannellini", "white bean",
  "parmesan", "parmigiano", "pecorino", "romano", "grana padano", "cheddar", "monterey jack", "pepper jack",
  "yogurt", "tortilla", "naan", "pita", "pizza dough", "fish sauce", "hoisin", "oyster sauce", "peanut", "panko",
];

// Pricey up front but keeps for months.
const STOCK_UP = [
  "walnut", "pecan", "pine nut", "cashew", "almond", "pistachio", "hazelnut", "macadamia", "nut", "medjool", "date",
  "dried fruit", "pepita", "pumpkin seed",
];

// Cheap or always on hand. Anything not matched above that's here, or
// that isn't perishable, is ignored.
const STAPLE = ["lemon", "lime", "orange", "garlic", "onion", "shallot", "butter", "egg", "milk", "rice", "pasta", "noodle", "honey", "mayonnaise", "mayo", "mustard", "ketchup", "hot sauce", "worcestershire", "bbq sauce", "barbecue sauce", "soy sauce", "pepper"];

function has(key: string, words: string[]): boolean {
  return words.some((w) => {
    const k = matchKey(w);
    return key === k || key.startsWith(`${k} `) || key.endsWith(` ${k}`) || key.includes(` ${k} `);
  });
}

/** The starting tier for an ingredient, from its name. */
export function defaultTier(name: string, perishable = false): ShareTier {
  const key = matchKey(name);
  if (has(key, USE_UP_FIRST)) return "use_up";
  if (has(key, PANTRY_FIRST)) return "pantry";
  if (has(key, ["almond extract", "almond milk"])) return "ignore";
  if (has(key, STOCK_UP_FIRST)) return "stock_up";
  if (has(key, IGNORE_PHRASES)) return "ignore";
  if (has(key, USE_UP)) return "use_up";
  if (has(key, STOCK_UP)) return "stock_up";
  if (has(key, PANTRY)) return "pantry";
  if (has(key, STAPLE)) return "ignore";
  return perishable ? "use_up" : "ignore";
}

/** The household's choice if there is one, otherwise the starting guess. */
export function tierOf(name: string, perishable: boolean, override: string | null | undefined): ShareTier {
  return SHARE_TIERS.includes(override as ShareTier) ? (override as ShareTier) : defaultTier(name, perishable);
}

export const TIER_LABEL: Record<ShareTier, string> = { use_up: "use up", stock_up: "use over a few weeks", pantry: "nice to share", ignore: "ignore" };

/** Sorts the names a recipe was saved with into tiers, with the starting guesses. */
export function sortByTier(names: string[]) {
  const out = { useUp: [] as string[], pantry: [] as string[], stockUp: [] as string[] };
  for (const name of names.map((p) => p.toLowerCase())) {
    const tier = tierOf(name, true, null);
    if (tier === "use_up") out.useUp.push(name);
    else if (tier === "pantry") out.pantry.push(name);
    else if (tier === "stock_up") out.stockUp.push(name);
  }
  return out;
}
