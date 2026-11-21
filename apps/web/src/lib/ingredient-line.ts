/**
 * Ingredient lines, split into parts. The base ingredient ("carrot") is what
 * Chef matches across recipes; prep and size words ("shredded", "large") are a
 * separate qualifier, so "1 shredded carrot" and "1 carrot, shredded" agree.
 */

export const UNITS = [
  "tsp",
  "tbsp",
  "cup",
  "fl oz",
  "ml",
  "l",
  "oz",
  "lb",
  "g",
  "kg",
  "each",
  "clove",
  "can",
  "bunch",
  "head",
  "slice",
  "piece",
  "sprig",
  "stalk",
  "package",
  "pinch",
  "dash",
  "to taste",
] as const;

export type Unit = (typeof UNITS)[number];

/** Units that don't need an amount. */
export const AMOUNT_OPTIONAL: readonly Unit[] = ["pinch", "dash", "to taste"];

export type IngredientParts = {
  quantity: number | null;
  unit: Unit | null;
  /** The base ingredient, lowercase, e.g. "carrot". */
  name: string | null;
  /** Prep and size words, e.g. "shredded" or "large, finely chopped". */
  prep: string | null;
};

const UNIT_ALIASES: Record<string, Unit> = {};
const alias = (unit: Unit, ...names: string[]) => {
  for (const n of [unit, ...names]) UNIT_ALIASES[n] = unit;
};
alias("tsp", "t", "tsps", "teaspoon", "teaspoons");
alias("tbsp", "T", "tbs", "tbsps", "tablespoon", "tablespoons");
alias("cup", "c", "cups");
alias("fl oz", "fluid ounce", "fluid ounces", "fl ounce", "fl ounces");
alias("ml", "milliliter", "milliliters", "millilitre", "millilitres");
alias("l", "liter", "liters", "litre", "litres");
alias("oz", "ounce", "ounces");
alias("lb", "lbs", "pound", "pounds");
alias("g", "gram", "grams");
alias("kg", "kilogram", "kilograms");
alias("each", "ea", "whole");
alias("clove", "cloves");
alias("can", "cans", "tin", "tins");
alias("bunch", "bunches");
alias("head", "heads");
alias("slice", "slices");
alias("piece", "pieces", "pc", "pcs");
alias("sprig", "sprigs");
alias("stalk", "stalks");
alias("package", "packages", "pkg", "packet", "packets", "pack", "packs", "bag", "bags");
alias("pinch", "pinches");
alias("dash", "dashes");
for (const u of UNITS) UNIT_ALIASES[u] = u;

/** Maps "Tablespoons", "Tbsp." or "lbs" to a unit on the list, or null. */
export function normalizeUnit(text: string | null | undefined): Unit | null {
  if (!text) return null;
  const t = text.trim().replace(/\.$/, "");
  // "T" (tablespoon) and "t" (teaspoon) only differ by case.
  if (t === "T" || t === "t") return UNIT_ALIASES[t];
  return UNIT_ALIASES[t.toLowerCase()] ?? null;
}

/** Prep and size words that never belong in the base ingredient. */
const PREP_WORDS = new Set([
  "large", "small", "medium", "big", "extra-large", "jumbo", "baby",
  "shredded", "grated", "minced", "chopped", "diced", "sliced", "cubed", "julienned", "halved", "quartered",
  "crushed", "torn", "trimmed", "peeled", "pitted", "seeded", "cored", "zested", "juiced", "mashed",
  "rinsed", "drained", "softened", "melted", "beaten", "divided", "packed", "sifted", "toasted",
  "fresh", "freshly", "cold", "warm", "room-temperature", "thawed", "frozen", "cooked", "uncooked", "leftover",
  "finely", "roughly", "coarsely", "thinly", "thickly", "lightly", "loosely", "firmly",
  "skin-on", "skinless", "boneless", "bone-in", "lean",
]);

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

/** Reads "1", "1.5", "1/2", "1 1/2" or "1½". Returns null for anything else. */
export function parseAmount(text: string): number | null {
  const t = text
    .trim()
    .replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => UNICODE_FRACTIONS[c]);
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return +m[3] ? +m[1] + +m[2] / +m[3] : null;
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return +m[2] ? +m[1] / +m[2] : null;
  m = t.match(/^\d+(\.\d+)?$|^\.\d+$/);
  return m ? Number(t) : null;
}

/** Writes 1.5 as "1 1/2" and 0.33 as "1/3", for showing amounts the way recipes do. */
export function formatAmount(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.01) return String(whole);
  const fractions: [number, string][] = [
    [1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [3 / 8, "3/8"], [1 / 2, "1/2"],
    [5 / 8, "5/8"], [2 / 3, "2/3"], [3 / 4, "3/4"], [7 / 8, "7/8"],
  ];
  const near = fractions.find(([v]) => Math.abs(v - rest) < 0.02);
  if (!near) return String(Math.round(n * 100) / 100);
  return whole ? `${whole} ${near[1]}` : near[1];
}

const AMOUNT_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/;

function joinPrep(parts: string[]): string | null {
  const p = parts.map((s) => s.trim().replace(/^[,;]\s*|[,;]\s*$/g, "")).filter(Boolean);
  return p.length ? p.join(", ").toLowerCase() : null;
}

/** Moves prep and size words off the front of the text, keeping at least one word. */
function takeLeadingPrep(text: string, prep: string[]): string {
  const taken: string[] = [];
  let rest = text;
  for (;;) {
    const m = rest.match(/^([A-Za-z-]+),?\s+(?=\S)/);
    if (!m || !PREP_WORDS.has(m[1].toLowerCase())) break;
    taken.push(m[1].toLowerCase());
    rest = rest.slice(m[0].length);
  }
  if (taken.length) prep.push(taken.join(" "));
  return rest;
}

/** Splits an ingredient line as written ("1 1/2 Tbsp. capers, rinsed") into its parts. */
export function parseIngredientLine(line: string): IngredientParts {
  let rest = line.replace(/\s+/g, " ").trim();
  const lead: string[] = []; // "large shredded"
  let tail = ""; // after the comma: "cut into pieces"
  const prep: string[] = []; // asides: "15-oz", "about 1 cup", "for serving"
  let quantity: number | null = null;
  let unit: Unit | null = null;

  // "to taste" anywhere on the line.
  if (/\bto taste\b/i.test(rest)) {
    unit = "to taste";
    rest = rest.replace(/,?\s*\bto taste\b/i, "").trim();
  }

  // Bracketed asides: "(15-oz)", "(about 1 cup)", "(see notes!)".
  rest = rest.replace(/\s*\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) prep.push(inner.trim());
    return " ";
  }).replace(/\s+/g, " ").trim();

  // Amount, allowing ranges like "2-3" or "2 to 3" (the first number is kept).
  const amount = rest.match(AMOUNT_RE);
  if (amount) {
    quantity = parseAmount(amount[1]);
    rest = rest.slice(amount[0].length).trim();
    const range = rest.match(/^(?:-|–|to)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*/);
    if (range) rest = rest.slice(range[0].length).trim();
  } else if (/^(a|an|one)\s/i.test(rest)) {
    quantity = 1;
    rest = rest.replace(/^(a|an|one)\s/i, "");
  }

  // A size stuck to the unit, like "15-oz can".
  const sized = rest.match(/^(\d+(?:\.\d+)?-?\s?(?:oz|ounce|g|lb|ml)\.?)\s+(\S+)/i);
  if (sized && normalizeUnit(sized[2])) {
    prep.push(sized[1].replace(/\s/, "-"));
    rest = rest.slice(sized[1].length).trim();
  }

  // Size words can come before the unit: "1 small bunch scallions".
  rest = takeLeadingPrep(rest, lead);

  // Unit: try two words ("fl oz", "fluid ounces") before one.
  if (unit !== "to taste" || quantity !== null) {
    const words = rest.split(" ");
    const two = normalizeUnit(words.slice(0, 2).join(" "));
    const one = normalizeUnit(words[0]);
    if (two && words.length > 2) {
      unit = two;
      rest = words.slice(2).join(" ");
    } else if (one && words.length > 1 && !(one === "can" && quantity === null)) {
      unit = one;
      rest = words.slice(1).join(" ");
    }
  }
  rest = rest.replace(/^of\s+/i, "");

  // Prep words up front, even with commas between them: "boneless, skinless chicken".
  rest = takeLeadingPrep(rest, lead);

  // Everything after the first comma is prep: "carrot, shredded".
  const comma = rest.indexOf(",");
  if (comma >= 0) {
    tail = rest.slice(comma + 1);
    rest = rest.slice(0, comma);
  }

  // What it's for goes with the prep: "basil for serving".
  rest = rest.replace(/\s+(for (?:serving|topping|garnish|garnishing|drizzling|dipping))$/i, (_, why: string) => {
    prep.push(why);
    return "";
  });

  let name = rest.replace(/[.;:,]+$/, "").trim().toLowerCase() || null;
  // "2 garlic cloves" is the same as "2 cloves garlic".
  const trailing = name?.match(/^(.+) (cloves?|sprigs?|stalks?)$/);
  if (trailing && (!unit || unit === "each")) {
    name = trailing[1];
    unit = normalizeUnit(trailing[2]);
  }
  if (quantity !== null && !unit) unit = "each";
  return { quantity, unit, name, prep: joinPrep([...lead, tail, ...prep]) };
}

/** Rebuilds the line as people read it: "1 1/2 tbsp capers, rinsed". */
export function formatIngredientLine(p: IngredientParts): string {
  const head = [
    p.quantity !== null ? formatAmount(p.quantity) : null,
    p.unit && p.unit !== "each" && p.unit !== "to taste" ? p.unit : null,
    p.name,
  ]
    .filter(Boolean)
    .join(" ");
  const tail = [p.prep, p.unit === "to taste" ? "to taste" : null].filter(Boolean).join(", ");
  return tail ? `${head}, ${tail}` : head;
}

/** The key two ingredient names share when they're the same food: lowercase, singular. */
export function matchKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      if (w.length <= 3 || w.endsWith("ss")) return w;
      if (/(tomato|potato)es$/.test(w)) return w.slice(0, -2);
      if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
      if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
      if (w.endsWith("s")) return w.slice(0, -1);
      return w;
    })
    .join(" ");
}
