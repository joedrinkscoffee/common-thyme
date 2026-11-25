/**
 * Turns an ingredient as a recipe names it into what you'd write on a
 * shopping list: "pasture-raised eggs" is eggs, "cremini mushrooms" is
 * mushrooms (shiitake stays shiitake), "kosher salt" and "black pepper" are
 * salt & pepper, and "Asian-style aromatics" is ginger, garlic and scallions.
 */
import { matchKey, parseIngredientLine, type Unit } from "../ingredient-line";

export type ShoppingPart = { name: string; quantity: number | null; unit: Unit | null };

// Words that describe how it was raised or sold, not what it is.
const DESCRIBERS = [
  "pasture raised", "pastured", "free range", "cage free", "organic", "local", "grass fed", "wild caught", "wild", "farm fresh",
  "fresh", "large", "extra large", "jumbo", "medium", "small", "baby bella", "low sodium", "reduced sodium", "no salt added",
  "unsalted", "kosher", "flaky", "fine", "coarse", "freshly ground", "ground black", "cracked",
];

// Recipe kits list a few aromatics under one name; on a list they're separate things to buy.
const COMBOS: [string, string[]][] = [
  ["asian style aromatics", ["ginger", "garlic", "scallions"]],
  ["asian aromatics", ["ginger", "garlic", "scallions"]],
  ["aromatics", ["ginger", "garlic", "scallions"]],
  ["mirepoix", ["onion", "carrots", "celery"]],
  ["holy trinity", ["onion", "bell pepper", "celery"]],
];

// Mushrooms you'd ask for by name; any other kind is just mushrooms.
const SPECIAL_MUSHROOMS = ["shiitake", "oyster", "maitake", "enoki", "chanterelle", "porcini", "morel", "king trumpet", "lion s mane", "beech", "portobello"];

const SALT_PEPPER = /^(salt|pepper|black pepper|ground pepper|white pepper|sea salt|salt and pepper|salt pepper|salt and black pepper|peppercorn|black peppercorn)$/;

/** Takes "plus 1/8 teaspoon salt" or "additional 2 tbsp oil" down to the ingredient. */
function stripLeftovers(name: string): string {
  let n = name.trim().toLowerCase();
  for (let i = 0; i < 3; i++) {
    const m = n.match(/^(plus|and|additional|extra(?! virgin)|more|about|or|optional:?)\s+(.*)$/);
    if (!m) break;
    n = m[2];
    const again = parseIngredientLine(n);
    if (again.name && again.name !== n) n = again.name;
  }
  // "1 inch fresh ginger" reads as an inch of something: drop the size.
  n = n.replace(/^([0-9/. ]+)?-?inch(es)?\s+(pieces?\s+)?(of\s+)?/, "");
  return n.replace(/\s*\(.*?\)\s*/g, " ").replace(/,.*$/, "").replace(/\s+/g, " ").trim();
}

/** The simple name to shop for. */
export function shoppingName(written: string): string {
  let n = stripLeftovers(written);
  let key = matchKey(n);
  // Drop describers from the front ("pasture-raised eggs" → "eggs").
  for (let changed = true; changed; ) {
    changed = false;
    for (const d of DESCRIBERS) {
      const k = matchKey(d);
      if (key.startsWith(`${k} `)) {
        key = key.slice(k.length + 1);
        n = n.split(/[\s-]+/).slice(d.split(" ").length).join(" ");
        changed = true;
      }
    }
  }
  if (SALT_PEPPER.test(key) || /^(kosher|sea|table) salt$/.test(key)) return "salt & pepper";
  if (/(^| )egg$/.test(key) && !/noodle|plant|roll|wash/.test(key)) return key.includes("quail") ? "quail eggs" : "eggs";
  if (/(^| )mushroom$/.test(key)) {
    const special = SPECIAL_MUSHROOMS.find((s) => key.includes(s));
    return special ? `${special.replace("lion s", "lion's")} mushrooms` : "mushrooms";
  }
  // Baby greens are the same thing to shop for: baby spinach is spinach.
  if (/^baby (spinach|kale|arugula|bok choy|chard|greens?)$/.test(key)) return n.replace(/^baby[\s-]+/, "");
  if (/^(shiitake|cremini|crimini|button)$/.test(key)) return key === "shiitake" ? "shiitake mushrooms" : "mushrooms";
  return n;
}

/**
 * Never on the list: every kitchen has salt & pepper and extra virgin olive
 * oil (Joe, 2026-11-23). Takes a name from shoppingName.
 */
export function alwaysOnHand(name: string): boolean {
  return name === "salt & pepper" || /^((extra )?virgin )?olive oil$|^evoo$/.test(matchKey(name));
}

/** What to buy for one recipe line: usually one thing, a few for a combo like aromatics. */
export function shoppingParts(name: string, quantity: number | null, unit: Unit | null): ShoppingPart[] {
  const key = matchKey(stripLeftovers(name));
  const combo = COMBOS.find(([c]) => key === matchKey(c));
  if (combo) return combo[1].map((n) => ({ name: n, quantity: null, unit: null }));
  return [{ name: shoppingName(name), quantity, unit }];
}
