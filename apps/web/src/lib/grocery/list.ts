/**
 * The grocery list for a week, built from its planned meals: every
 * ingredient line, scaled to the servings planned, combined across recipes
 * and grouped by aisle in the order you walk the store. Pantry and
 * multi-use items (soy sauce, rice, eggs, ginger) are asked about first:
 * anything marked "already have it" drops off the list. Salt & pepper and
 * olive oil are never listed.
 *
 * Pure: the page and Chef both call it with what the store loaded.
 */
import { formatAmount, matchKey, parseIngredientLine, type Unit } from "../ingredient-line";
import { alwaysOnHand, shoppingName, shoppingParts } from "./names";
import { AISLES, AISLE_LABEL, aisleOf, isAisle, likelyOnHand, shopAisle, soldByBunch, type Aisle } from "./aisles";
import type { MealType } from "../chef/store";

export type GroceryLine = {
  /** The base ingredient, like "carrot". Null when the line couldn't be read. */
  name: string | null;
  quantity: number | null;
  unit: Unit | null;
  /** The line as written, used when it has no name. */
  raw: string;
  /** The household's aisle for this ingredient, if they moved it. */
  aisle?: string | null;
};

export type GroceryMeal = {
  id: string;
  date: string;
  meal: MealType;
  title: string;
  /** Servings planned over the recipe's own servings. */
  scale: number;
  lines: GroceryLine[];
};

/** Something added by hand ("paper towels"), or an item someone checked off. */
export type GroceryMark = {
  key: string;
  /** Set for items added by hand. */
  label: string | null;
  aisle: string | null;
  checked: boolean;
  checkedBy?: string | null;
  /** "have": already on hand, skip it. "need": out of it, so shop for it. Null: not said. */
  status?: GroceryStatus | null;
};

export type GroceryStatus = "have" | "need";

export type GroceryUse = { mealId: string; date: string; meal: MealType; title: string };

export type GroceryItem = {
  key: string;
  name: string;
  /** "2 lb" or "×3"; null when one will do or it's bought by the carton. */
  amount: string | null;
  aisle: Aisle;
  uses: GroceryUse[];
  checked: boolean;
  checkedBy: string | null;
  /** Added by hand, not from a recipe. */
  extra: boolean;
  /** Said to be on hand ("have") or needed ("need"); null until someone says. */
  status: GroceryStatus | null;
  /** A pantry or multi-use item you might already have, so the list asks first. */
  likely: boolean;
};

export type GrocerySection = { aisle: Aisle; label: string; items: GroceryItem[] };

export type GroceryList = {
  /** What to buy, by aisle. */
  sections: GrocerySection[];
  /** Pantry and multi-use items nobody has said they have or need yet: "Already have these?" */
  pantryCheck: GroceryItem[];
  /** Marked as already on hand: off the shopping list. */
  have: GroceryItem[];
  /** Items to buy, and how many are checked off. */
  total: number;
  checked: number;
  meals: number;
};

// ------------------------------------------------------------------ amounts

const WEIGHT_OZ: Partial<Record<Unit, number>> = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 };
/** Units you can count at the store: "2 lemons", "1 bunch", "2 cans". Cups, spoons and cloves aren't. */
const COUNTED: (Unit | null)[] = [null, "each", "bunch", "head", "can", "package", "piece", "stalk"];
/** Aisles where weight is how you buy (proteins and vegetables). */
const BY_WEIGHT: Aisle[] = ["produce", "meat"];
/** Aisles bought by the carton or container: no amount at all (eggs, oat milk, half and half). */
const NO_AMOUNT: Aisle[] = ["dairy", "staples"];

/**
 * How much to buy, the way you'd shop: a weight for proteins and vegetables
 * ("1 1/2 lb"), otherwise a whole count shown only when it's more than one
 * ("×3"). Never cups or spoons; one of something needs no amount.
 */
export function shoppingAmount(parts: { quantity: number | null; unit: Unit | null }[], aisle: Aisle): string | null {
  if (NO_AMOUNT.includes(aisle)) return null;
  let oz = 0;
  let count = 0;
  for (const p of parts) {
    if (p.quantity === null || !(p.quantity > 0)) continue;
    const perOz = p.unit ? WEIGHT_OZ[p.unit] : undefined;
    if (perOz) oz += p.quantity * perOz;
    else if (COUNTED.includes(p.unit)) count += p.quantity;
  }
  if (oz && BY_WEIGHT.includes(aisle)) {
    if (oz >= 16) return `${formatAmount(Math.ceil((oz / 16) * 4 - 1e-6) / 4)} lb`;
    return `${Math.ceil(oz - 1e-6)} oz`;
  }
  const whole = Math.ceil(count - 1e-6);
  return whole >= 2 ? `×${whole}` : null;
}

// ------------------------------------------------------------------ names

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A stable key for an item added by hand. */
export function extraKey(label: string): string {
  return `extra:${matchKey(label).replace(/ /g, "-").slice(0, 80) || "item"}`;
}

// ------------------------------------------------------------------ the list

export function buildGroceryList(meals: GroceryMeal[], marks: GroceryMark[] = []): GroceryList {
  type Acc = { key: string; names: Map<string, number>; parts: { quantity: number | null; unit: Unit | null }[]; uses: GroceryUse[]; aisle: Aisle; moved: Aisle | null };
  const byKey = new Map<string, Acc>();

  for (const m of meals) {
    const use: GroceryUse = { mealId: m.id, date: m.date, meal: m.meal, title: m.title };
    for (const line of m.lines) {
      const written = line.name ?? parseIngredientLine(line.raw).name ?? line.raw;
      for (const part of shoppingParts(written, line.quantity, line.unit)) {
        if (alwaysOnHand(part.name)) continue;
        // Canned tomatoes aren't fresh tomatoes: a can is its own item, in the pantry aisle.
        const canned = part.unit === "can" && !/\bcanned\b/i.test(part.name);
        const base = matchKey(part.name);
        if (!base) continue;
        const key = canned ? `canned ${base}` : base;
        const name = canned ? `canned ${part.name}` : part.name;
        // The household's aisle applies to the line's own ingredient, not to the parts of a combo.
        const override = part.name === written.toLowerCase() || shoppingName(written) === part.name ? line.aisle : null;
        let acc = byKey.get(key);
        if (!acc) {
          acc = { key, names: new Map(), parts: [], uses: [], aisle: canned && !isAisle(override) ? "pantry" : aisleOf(name, override), moved: isAisle(override) ? override : null };
          byKey.set(key, acc);
        } else if (isAisle(override)) {
          acc.aisle = override;
          acc.moved = override;
        }
        acc.names.set(name, (acc.names.get(name) ?? 0) + 1);
        acc.parts.push({ quantity: part.quantity === null ? null : part.quantity * m.scale, unit: part.unit });
        if (!acc.uses.some((u) => u.mealId === m.id)) acc.uses.push(use);
      }
    }
  }

  const markOf = new Map(marks.map((k) => [k.key, k]));
  const items: GroceryItem[] = [];
  for (const acc of byKey.values()) {
    // The name most recipes use, singular or plural as written.
    const name = [...acc.names.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    const mark = markOf.get(acc.key);
    items.push({
      key: acc.key,
      name: cap(name),
      amount: soldByBunch(name) ? null : shoppingAmount(acc.parts, acc.aisle),
      aisle: shopAisle(name, acc.aisle),
      status: mark?.status ?? null,
      // The household's own aisle decides when they moved it; otherwise the ingredient does.
      likely: acc.aisle === "staples" || likelyOnHand(name, acc.moved),
      uses: acc.uses.sort((a, b) => a.date.localeCompare(b.date)),
      checked: mark?.checked ?? false,
      checkedBy: mark?.checked ? (mark.checkedBy ?? null) : null,
      extra: false,
    });
  }
  for (const mark of marks) {
    if (!mark.label || byKey.has(mark.key)) continue;
    items.push({
      key: mark.key,
      name: cap(mark.label),
      amount: null,
      aisle: shopAisle(mark.label, mark.aisle),
      status: mark.status ?? null,
      // Added by hand means they want it.
      likely: false,
      uses: [],
      checked: mark.checked,
      checkedBy: mark.checked ? (mark.checkedBy ?? null) : null,
      extra: true,
    });
  }

  const byName = (a: GroceryItem, b: GroceryItem) => a.name.localeCompare(b.name);
  const toBuy = (i: GroceryItem) => i.status === "need" || (i.status === null && !i.likely);
  const sections: GrocerySection[] = [];
  for (const aisle of AISLES) {
    const here = items.filter((i) => i.aisle === aisle && toBuy(i)).sort(byName);
    if (here.length) sections.push({ aisle, label: AISLE_LABEL[aisle], items: here });
  }
  const buying = sections.flatMap((s) => s.items);
  return {
    sections,
    pantryCheck: items.filter((i) => i.status === null && i.likely).sort(byName),
    have: items.filter((i) => i.status === "have").sort(byName),
    total: buying.length,
    checked: buying.filter((i) => i.checked).length,
    meals: meals.length,
  };
}

/** The list as a few lines of text, for Chef. */
export function groceryText(list: GroceryList): string {
  if (!list.total && !list.pantryCheck.length && !list.have.length) return "The list is empty: no meals planned that week yet.";
  const lines = [`${list.total} items to buy for ${list.meals} meals (${list.checked} checked off).`];
  for (const s of list.sections) {
    lines.push(`${s.label}: ${s.items.map((i) => `${i.name}${i.amount ? ` (${i.amount})` : ""}${i.checked ? " ✓" : ""}`).join(", ")}`);
  }
  if (list.pantryCheck.length) lines.push(`Not yet asked whether they have these on hand: ${list.pantryCheck.map((i) => i.name).join(", ")}`);
  if (list.have.length) lines.push(`Already have (not shopping for): ${list.have.map((i) => i.name).join(", ")}`);
  return lines.join("\n");
}
