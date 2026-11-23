/**
 * Where an ingredient sits in the store, so the grocery list reads in the
 * order you walk it. This is the starting guess from the name; the household
 * can move any ingredient (Chef saves it on the ingredient).
 *
 * "staples" is not an aisle: it's things a kitchen usually has (salt, oil,
 * spices, butter, ketchup). They sit in a folded section at the end of the
 * list, to check before you go.
 */
import { matchKey } from "../ingredient-line";

export const AISLES = [
  "produce",
  "bakery",
  "meat",
  "cheese",
  "dairy",
  "pantry",
  "grains",
  "international",
  "baking",
  "nuts",
  "frozen",
  "drinks",
  "other",
  "staples",
] as const;
export type Aisle = (typeof AISLES)[number];
export const isAisle = (v: unknown): v is Aisle => AISLES.includes(v as Aisle);

export const AISLE_LABEL: Record<Aisle, string> = {
  produce: "Produce",
  bakery: "Bakery & bread",
  meat: "Meat & seafood",
  cheese: "Cheese & deli",
  dairy: "Dairy & eggs",
  pantry: "Cans, jars & sauces",
  grains: "Pasta, rice & grains",
  international: "International",
  baking: "Baking & spices",
  nuts: "Dried fruit",
  frozen: "Frozen",
  drinks: "Wine & drinks",
  other: "Everything else",
  staples: "Pantry staples you probably have",
};

/** One emoji per aisle, as a sticker on its heading. */
export const AISLE_ICON: Record<Aisle, string> = {
  produce: "🥬",
  bakery: "🥖",
  meat: "🍗",
  cheese: "🧀",
  dairy: "🥛",
  pantry: "🥫",
  grains: "🍝",
  international: "🥢",
  baking: "🧂",
  nuts: "🍇",
  frozen: "🧊",
  drinks: "🍷",
  other: "🛒",
  staples: "🫙",
};

// Checked in order; the first list with a match wins. Earlier rules catch
// names that contain a word from a later aisle ("chicken stock" isn't meat,
// "frozen peas" isn't produce, "garlic powder" isn't produce).
const RULES: [Aisle, string[]][] = [
  ["frozen", ["frozen", "ice cream", "puff pastry", "phyllo"]],
  [
    "staples",
    [
      "salt", "kosher salt", "sea salt", "black pepper", "ground pepper", "white pepper", "peppercorn", "pepper to taste",
      "olive oil", "extra virgin olive oil", "vegetable oil", "canola oil", "neutral oil", "avocado oil", "cooking spray", "oil",
      "butter", "unsalted butter", "salted butter", "ketchup", "mayonnaise", "mayo", "dijon mustard", "yellow mustard", "mustard",
      "garlic", "garlic clove", "water", "ice", "sugar", "brown sugar", "granulated sugar", "all purpose flour", "flour", "honey",
      "garlic powder", "onion powder", "red pepper flake", "crushed red pepper", "chili flake", "paprika", "smoked paprika",
      "cumin", "ground cumin", "dried oregano", "oregano", "chili powder", "cinnamon", "ground cinnamon", "nutmeg", "cayenne",
      "bay leaf", "bay leaves", "dried thyme", "italian seasoning", "garam masala", "curry powder", "turmeric", "ground coriander",
      "coriander", "ground ginger", "dried basil", "dried parsley", "baking soda", "baking powder", "vanilla extract", "vanilla",
      "cornstarch", "soy sauce", "white vinegar", "red wine vinegar", "apple cider vinegar", "rice vinegar", "balsamic vinegar",
      "sherry vinegar", "vinegar", "hot sauce", "sriracha", "worcestershire", "worcestershire sauce",
      // Joe keeps these on hand too: sesame, soy sauce of any kind, broth, and nuts.
      "sesame seed", "black sesame seed", "white sesame seed", "sesame oil", "toasted sesame oil", "tamari", "dark soy sauce", "light soy sauce",
      "coconut aminos", "broth", "stock", "bouillon", "better than bouillon", "walnut", "pecan", "pine nut", "cashew", "almond", "pistachio",
      "hazelnut", "macadamia", "peanut", "pepita", "pumpkin seed", "sunflower seed", "nut",
    ],
  ],
  ["pantry", ["broth", "stock", "bouillon", "canned", "tomato paste", "tomato sauce", "crushed tomato", "diced tomato", "whole peeled tomato", "san marzano", "marinara", "salsa", "sun dried tomato", "sundried tomato", "roasted red pepper", "peppadew", "pickled", "pickle", "caper", "olive", "artichoke heart", "chipotle", "adobo", "black bean", "pinto bean", "kidney bean", "cannellini", "white bean", "chickpea", "garbanzo", "lentil", "refried", "coconut milk", "coconut cream", "pesto", "jam", "preserve", "peanut butter", "almond butter", "tahini", "maple syrup", "agave", "bbq sauce", "barbecue sauce", "hot honey", "anchov", "tuna", "chili oil", "chili crisp", "calabrian", "harissa", "mole", "enchilada sauce", "cream of"]],
  ["international", ["fish sauce", "oyster sauce", "hoisin", "sesame oil", "toasted sesame oil", "mirin", "sake", "rice wine", "gochujang", "gochugaru", "miso", "curry paste", "sambal", "chile paste", "chili paste", "tamari", "ponzu", "furikake", "nori", "seaweed", "wonton", "dumpling wrapper", "rice paper", "kimchi", "black bean sauce", "chili garlic", "sweet chili", "coconut aminos", "panko"]],
  ["meat", ["chicken", "beef", "steak", "pork", "lamb", "turkey", "sausage", "bacon", "pancetta", "chorizo", "ham", "veal", "duck", "chop", "cutlet", "thigh", "breast", "tenderloin", "brisket", "rib", "shrimp", "prawn", "salmon", "cod", "halibut", "tilapia", "tuna steak", "scallop", "mussel", "clam", "crab", "lobster", "fish", "trout", "snapper", "sea bass", "mahi"]],
  ["baking", ["baking", "yeast", "cocoa", "chocolate chip", "powdered sugar", "confectioner", "cornmeal", "extract", "sprinkle", "spice", "seasoning", "powder", "ground", "dried", "sesame seed", "poppy seed", "fennel seed", "mustard seed", "cumin seed", "za atar", "sumac", "saffron", "star anise", "clove"]],
  ["nuts", ["walnut", "pecan", "pine nut", "cashew", "almond", "pistachio", "hazelnut", "macadamia", "peanut", "pepita", "pumpkin seed", "sunflower seed", "raisin", "golden raisin", "dried cranberry", "dried cherry", "dried apricot", "dried fig", "medjool", "date", "currant", "nut"]],
  [
    "cheese",
    [
      "parmesan", "parmigiano", "pecorino", "romano", "grana padano", "mozzarella", "burrata", "ricotta", "feta", "goat cheese", "chevre",
      "gruyere", "fontina", "brie", "camembert", "blue cheese", "gorgonzola", "halloumi", "paneer", "manchego", "cotija", "queso",
      "cheddar", "monterey jack", "pepper jack", "jack cheese", "swiss", "provolone", "havarti", "gouda", "mascarpone", "cheese",
      "prosciutto", "salami", "pepperoni", "soppressata", "mortadella", "deli", "hummus",
    ],
  ],
  ["dairy", ["milk", "half and half", "heavy cream", "whipping cream", "cream cheese", "sour cream", "creme fraiche", "crème fraîche", "buttermilk", "yogurt", "greek yogurt", "skyr", "kefir", "egg", "cream", "ghee", "tofu", "tempeh", "pizza dough", "tortellini", "ravioli", "gnocchi", "fresh pasta"]],
  ["bakery", ["bread", "baguette", "ciabatta", "sourdough", "brioche", "bun", "roll", "pita", "naan", "flatbread", "tortilla", "lavash", "english muffin", "bagel", "croissant", "focaccia", "breadcrumb", "crouton", "taco shell", "wrap"]],
  ["grains", ["pasta", "spaghetti", "linguine", "fettuccine", "penne", "rigatoni", "orzo", "orecchiette", "farfalle", "fusilli", "bucatini", "lasagna", "macaroni", "noodle", "ramen", "udon", "soba", "rice noodle", "rice", "quinoa", "couscous", "farro", "barley", "bulgur", "polenta", "grits", "oat", "oats", "cereal", "cracker", "chip"]],
  ["drinks", ["wine", "white wine", "red wine", "beer", "vermouth", "sherry", "brandy", "bourbon", "rum", "vodka", "tequila", "sparkling water", "club soda", "juice", "coffee", "tea", "kombucha"]],
  [
    "produce",
    [
      "lemon", "lime", "orange", "grapefruit", "apple", "pear", "banana", "berry", "berries", "strawberry", "blueberry", "raspberry", "grape",
      "peach", "plum", "nectarine", "cherry", "mango", "pineapple", "melon", "watermelon", "pomegranate", "fig", "kiwi",
      "garlic", "onion", "red onion", "shallot", "scallion", "green onion", "leek", "ginger", "lemongrass", "chile", "chili", "jalapeno", "jalapeño",
      "serrano", "poblano", "habanero", "pepper", "bell pepper", "tomato", "cherry tomato", "avocado", "potato", "sweet potato", "yam",
      "carrot", "celery", "cucumber", "zucchini", "squash", "butternut", "pumpkin", "eggplant", "mushroom", "shiitake", "cremini", "portobello",
      "oyster mushroom", "spinach", "kale", "chard", "collard", "arugula", "lettuce", "romaine", "spring mix", "mixed green", "green",
      "cabbage", "bok choy", "broccoli", "broccolini", "cauliflower", "brussels sprout", "asparagus", "green bean", "snap pea", "snow pea",
      "pea", "corn", "radish", "daikon", "beet", "turnip", "parsnip", "fennel", "okra", "artichoke", "sprout", "microgreen",
      "basil", "cilantro", "parsley", "dill", "mint", "chive", "thyme", "rosemary", "sage", "tarragon", "oregano leaves",
    ],
  ],
];

function has(key: string, words: string[]): boolean {
  return words.some((w) => {
    const k = matchKey(w);
    return key === k || key.startsWith(`${k} `) || key.endsWith(` ${k}`) || key.includes(` ${k} `);
  });
}

// Checked before everything: fresh herbs whose names look like a staple
// ("fresh oregano") stay in produce; dried and ground ones are staples.
// Also names that contain a word from an earlier aisle ("peanut butter" isn't
// butter, "flour tortillas" aren't flour).
const FIRST: [Aisle, string[]][] = [
  ["produce", ["fresh thyme", "fresh oregano", "fresh ginger", "fresh rosemary", "fresh sage", "fresh basil", "fresh dill", "ginger root", "sugar snap pea", "fresh chive"]],
  ["pantry", ["peanut butter", "almond butter", "chili oil", "chili crisp", "hot honey", "truffle oil"]],
  ["international", ["chili garlic sauce"]],
  ["dairy", ["cream cheese", "almond milk", "oat milk", "soy milk"]],
  ["bakery", ["flour tortilla"]],
  ["grains", ["egg noodle"]],
  ["meat", ["tuna steak", "ahi tuna"]],
];

/** The starting aisle for an ingredient, from its name. */
export function defaultAisle(name: string): Aisle {
  const key = matchKey(name);
  if (!key) return "other";
  for (const [aisle, words] of FIRST) if (has(key, words)) return aisle;
  for (const [aisle, words] of RULES) if (has(key, words)) return aisle;
  return "other";
}

/** The household's choice if there is one, otherwise the starting guess. */
export function aisleOf(name: string, override: string | null | undefined): Aisle {
  return isAisle(override) ? override : defaultAisle(name);
}

// Greens, herbs and scallions: you grab a bunch or a bag, so the list doesn't count them.
const BY_THE_BUNCH = [
  "scallion", "green onion", "spring onion", "kale", "dino kale", "lacinato kale", "chard", "swiss chard", "collard", "spinach",
  "baby spinach", "arugula", "lettuce", "romaine", "spring mix", "mixed green", "watercress", "bok choy",
  "basil", "cilantro", "parsley", "dill", "mint", "chive", "thyme", "rosemary", "sage", "tarragon", "oregano", "microgreen", "pea shoot",
];

/** True for greens, herbs and scallions, which need no amount on the list. */
export function soldByBunch(name: string): boolean {
  const key = matchKey(name);
  if (/\b(dried|ground|powder|flake|seed)\b/.test(key)) return false;
  return has(key, BY_THE_BUNCH);
}

// Where to find a staple when you do need to buy it.
const STAPLE_HOME: [Aisle, string[]][] = [
  ["produce", ["garlic", "garlic clove"]],
  ["dairy", ["butter", "unsalted butter", "salted butter"]],
  ["nuts", ["walnut", "pecan", "pine nut", "cashew", "almond", "pistachio", "hazelnut", "macadamia", "peanut", "pepita", "pumpkin seed", "sunflower seed", "nut"]],
  ["international", ["sesame oil", "toasted sesame oil", "tamari", "coconut aminos", "soy sauce", "dark soy sauce", "light soy sauce"]],
  ["pantry", ["oil", "vinegar", "ketchup", "mayonnaise", "mayo", "mustard", "hot sauce", "sriracha", "worcestershire", "broth", "stock", "bouillon", "honey"]],
];

/** The aisle to shop in, never "staples": a staple you're out of still lives somewhere in the store. */
export function shopAisle(name: string, override?: string | null): Aisle {
  if (isAisle(override) && override !== "staples") return override;
  const guess = defaultAisle(name);
  if (guess !== "staples") return guess;
  const key = matchKey(name);
  for (const [aisle, words] of STAPLE_HOME) if (has(key, words)) return aisle;
  return "baking"; // salt, pepper, spices, flour, sugar, sesame seeds
}

// Things that keep and get used across many meals, so you likely have some: worth asking before you shop.
const MULTI_USE = ["egg", "parmesan", "parmigiano", "pecorino", "romano", "grana padano", "cheddar"];
const ON_HAND_AISLES: Aisle[] = ["staples", "pantry", "international", "baking", "grains", "nuts"];

/** True for pantry and multi-use items you might already have: soy sauce, jasmine rice, chili paste, eggs. */
export function likelyOnHand(name: string, override?: string | null): boolean {
  if (override === "staples") return true;
  if (isAisle(override)) return ON_HAND_AISLES.includes(override);
  const key = matchKey(name);
  if (/^canned /.test(key)) return true;
  return ON_HAND_AISLES.includes(defaultAisle(name)) || has(key, MULTI_USE);
}
