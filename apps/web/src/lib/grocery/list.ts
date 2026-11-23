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
  /** "2 lb", "1 1/2 cups + 2", or null when no recipe says how much. */
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

const VOLUME_TSP: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, "fl oz": 6, cup: 48, ml: 0.202884, l: 202.884 };
const WEIGHT_OZ: Partial<Record<Unit, number>> = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 };
const NO_AMOUNT: Unit[] = ["pinch", "dash", "to taste"];

const PLURAL: Partial<Record<Unit, string>> = {
  cup: "cups", clove: "cloves", can: "cans", bunch: "bunches", head: "heads", slice: "slices", piece: "pieces",
  sprig: "sprigs", stalk: "stalks", package: "packages",
};

/** Rounds up to a quarter, so a scaled 1.1 lemons reads 1 1/4 and nothing rounds to zero. */
const roundUp = (n: number, step = 0.25) => Math.max(step, Math.ceil(n / step - 1e-6) * step);

function withUnit(n: number, unit: Unit | null): string {
  const amount = formatAmount(n);
  if (!unit || unit === "each") return amount;
  return `${amount} ${n > 1 && PLURAL[unit] ? PLURAL[unit] : unit}`;
}

function volumeText(tsp: number): string {
  if (tsp >= 12) return withUnit(roundUp(tsp / 48), "cup");
  if (tsp >= 3) return withUnit(roundUp(tsp / 3, 0.5), "tbsp");
  return withUnit(roundUp(tsp), "tsp");
}

function weightText(oz: number): string {
  if (oz >= 16) return withUnit(roundUp(oz / 16), "lb");
  return withUnit(roundUp(oz, 0.5), "oz");
}

/** Adds up amounts in every unit they came in: volumes together, weights together, the rest per unit. */
export function combineAmounts(parts: { quantity: number | null; unit: Unit | null }[]): string | null {
  let tsp = 0;
  let oz = 0;
  const counts = new Map<string, number>(); // unit ("" for plain counts) -> total
  for (const p of parts) {
    if (p.quantity === null || !(p.quantity > 0) || (p.unit && NO_AMOUNT.includes(p.unit))) continue;
    const u = p.unit;
    if (u && VOLUME_TSP[u]) tsp += p.quantity * VOLUME_TSP[u]!;
    else if (u && WEIGHT_OZ[u]) oz += p.quantity * WEIGHT_OZ[u]!;
    else {
      const k = !u || u === "each" ? "" : u;
      counts.set(k, (counts.get(k) ?? 0) + p.quantity);
    }
  }
  const out: string[] = [];
  if (oz) out.push(weightText(oz));
  const plain = counts.get("");
  if (plain) out.push(withUnit(roundUp(plain, 0.5), null));
  for (const [u, n] of counts) if (u) out.push(withUnit(roundUp(n, 0.5), u as Unit));
  if (tsp) out.push(volumeText(tsp));
  return out.length ? out.join(" + ") : null;
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
      amount: combineAmounts(acc.parts),
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
