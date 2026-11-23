/**
 * The grocery list for a week, built from its planned meals: every
 * ingredient line, scaled to the servings planned, combined across recipes
 * and grouped by aisle in the order you walk the store. Staples (salt, oil,
 * butter, spices) sit at the end to check before you go.
 *
 * Pure: the page and Chef both call it with what the store loaded.
 */
import { formatAmount, matchKey, parseIngredientLine, type Unit } from "../ingredient-line";
import { AISLES, AISLE_LABEL, aisleOf, defaultAisle, isAisle, type Aisle } from "./aisles";
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
};

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
};

export type GrocerySection = { aisle: Aisle; label: string; items: GroceryItem[] };

export type GroceryList = {
  sections: GrocerySection[];
  /** Salt, oil, butter and the like: check the pantry first. */
  staples: GroceryItem[];
  /** Items to buy (staples aside), and how many are checked off. */
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

/** The key two lines share when they're the same thing to buy. */
export function itemKey(line: GroceryLine): string {
  const name = line.name ?? parseIngredientLine(line.raw).name ?? line.raw;
  return matchKey(name) || matchKey(line.raw);
}

// ------------------------------------------------------------------ the list

export function buildGroceryList(meals: GroceryMeal[], marks: GroceryMark[] = []): GroceryList {
  type Acc = { key: string; names: Map<string, number>; parts: { quantity: number | null; unit: Unit | null }[]; uses: GroceryUse[]; aisle: Aisle };
  const byKey = new Map<string, Acc>();

  for (const m of meals) {
    const use: GroceryUse = { mealId: m.id, date: m.date, meal: m.meal, title: m.title };
    for (const line of m.lines) {
      // Canned tomatoes aren't fresh tomatoes: a can is its own item, in the pantry aisle.
      const canned = line.unit === "can" && !/\bcanned\b/i.test(line.name ?? "");
      const base = itemKey(line);
      if (!base) continue;
      const key = canned ? `canned ${base}` : base;
      const written = (line.name ?? parseIngredientLine(line.raw).name ?? line.raw).toLowerCase();
      const name = canned ? `canned ${written}` : written;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { key, names: new Map(), parts: [], uses: [], aisle: canned && !isAisle(line.aisle) ? "pantry" : aisleOf(name, line.aisle) };
        byKey.set(key, acc);
      } else if (isAisle(line.aisle)) {
        acc.aisle = line.aisle;
      }
      acc.names.set(name, (acc.names.get(name) ?? 0) + 1);
      acc.parts.push({ quantity: line.quantity === null ? null : line.quantity * m.scale, unit: line.unit });
      if (!acc.uses.some((u) => u.mealId === m.id)) acc.uses.push(use);
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
      amount: shoppingAmount(acc.parts, acc.aisle),
      aisle: acc.aisle,
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
      aisle: isAisle(mark.aisle) ? mark.aisle : defaultAisle(mark.label),
      uses: [],
      checked: mark.checked,
      checkedBy: mark.checked ? (mark.checkedBy ?? null) : null,
      extra: true,
    });
  }

  const byName = (a: GroceryItem, b: GroceryItem) => a.name.localeCompare(b.name);
  const sections: GrocerySection[] = [];
  for (const aisle of AISLES) {
    if (aisle === "staples") continue;
    const here = items.filter((i) => i.aisle === aisle).sort(byName);
    if (here.length) sections.push({ aisle, label: AISLE_LABEL[aisle], items: here });
  }
  const staples = items.filter((i) => i.aisle === "staples").sort(byName);
  const toBuy = sections.flatMap((s) => s.items);
  return {
    sections,
    staples,
    total: toBuy.length,
    checked: toBuy.filter((i) => i.checked).length,
    meals: meals.length,
  };
}

/** The list as a few lines of text, for Chef. */
export function groceryText(list: GroceryList): string {
  if (!list.total && !list.staples.length) return "The list is empty: no meals planned that week yet.";
  const lines = [`${list.total} items to buy for ${list.meals} meals (${list.checked} checked off).`];
  for (const s of list.sections) {
    lines.push(`${s.label}: ${s.items.map((i) => `${i.name}${i.amount ? ` (${i.amount})` : ""}${i.checked ? " ✓" : ""}`).join(", ")}`);
  }
  if (list.staples.length) lines.push(`Staples to check at home: ${list.staples.map((i) => i.name).join(", ")}`);
  return lines.join("\n");
}
