import type { CatalogRecipe } from "./planner";
import { sortByTier, type ShareTier } from "./ingredient-tier";
import { matchKey, parseIngredientLine } from "../ingredient-line";
import { extraKey, type GroceryMark, type GroceryStatus } from "../grocery/list";
import type { Aisle } from "../grocery/aisles";
import { addDays } from "./dates";
import { DEFAULT_SETTINGS, byDayAndMeal, type ChefNote, type ChefStore, type HouseholdSettings, type NewRecipe, type RecipeFacts, type StoredDinner, type StoredPlan, type NewDinner, type DinnerPatch, type GroceryWeek } from "./store";

type MemoryRecipe = CatalogRecipe & { servings: number; ingredients: string[]; stepCount: number };

/** An in-memory household, for tests and the sample preview. */
export class MemoryStore implements ChefStore {
  recipes: MemoryRecipe[];
  plansList: StoredPlan[] = [];
  dinnerList: StoredDinner[] = [];
  noteList: ChefNote[] = [];
  groceryMarks = new Map<string, GroceryMark[]>(); // week -> marks
  aisles = new Map<string, Aisle>(); // ingredient match key -> aisle
  created: NewRecipe[] = [];
  private n = 0;

  constructor(
    recipes: (CatalogRecipe & Partial<MemoryRecipe>)[],
    private household: HouseholdSettings = DEFAULT_SETTINGS,
  ) {
    this.recipes = recipes.map((r) => ({ servings: 2, ingredients: r.useUp, stepCount: 3, ...r }));
  }

  private id(prefix: string) {
    this.n += 1;
    return `${prefix}-${String(this.n).padStart(4, "0")}`;
  }

  async settings() {
    return this.household;
  }
  async catalog() {
    return this.recipes.map(({ id, title, tags, totalMinutes, useUp, pantry, stockUp }) => ({
      id,
      title,
      tags,
      totalMinutes,
      useUp: [...useUp],
      pantry: [...(pantry ?? [])],
      stockUp: [...(stockUp ?? [])],
    }));
  }
  async recipe(id: string): Promise<RecipeFacts | null> {
    const r = this.recipes.find((x) => x.id === id);
    return r ? { id: r.id, title: r.title, servings: r.servings, totalMinutes: r.totalMinutes, tags: r.tags, ingredients: r.ingredients, stepCount: r.stepCount } : null;
  }
  async createRecipe(recipe: NewRecipe) {
    this.created.push(recipe);
    const id = this.id("recipe");
    this.recipes.push({
      id,
      title: recipe.title,
      tags: recipe.tags,
      totalMinutes: recipe.totalMinutes,
      ...sortByTier(recipe.perishable),
      servings: recipe.servings,
      ingredients: recipe.ingredientLines,
      stepCount: recipe.steps.length,
    });
    return { ok: true as const, id, title: recipe.title, photo: !!recipe.photo };
  }

  async setIngredientTier(name: string, tier: ShareTier) {
    const key = matchKey(name);
    let n = 0;
    for (const r of this.recipes) {
      const all = [...r.useUp, ...(r.pantry ?? []), ...(r.stockUp ?? []), ...r.ingredients.map((l) => l.toLowerCase())];
      if (!all.some((x) => matchKey(x) === key || matchKey(x).endsWith(` ${key}`))) continue;
      n += 1;
      r.useUp = r.useUp.filter((x) => matchKey(x) !== key);
      r.pantry = (r.pantry ?? []).filter((x) => matchKey(x) !== key);
      r.stockUp = (r.stockUp ?? []).filter((x) => matchKey(x) !== key);
      if (tier === "use_up") r.useUp.push(name.toLowerCase());
      if (tier === "pantry") r.pantry.push(name.toLowerCase());
      if (tier === "stock_up") r.stockUp.push(name.toLowerCase());
    }
    return n;
  }

  async plans(from: string, to: string) {
    return this.plansList.filter((p) => p.weekStart >= from && p.weekStart <= to);
  }
  async ensurePlan(weekStart: string) {
    let p = this.plansList.find((x) => x.weekStart === weekStart);
    if (!p) {
      p = { id: this.id("plan"), weekStart, status: "draft" };
      this.plansList.push(p);
    }
    return p;
  }
  async setPlanStatus(planId: string, status: StoredPlan["status"]) {
    const p = this.plansList.find((x) => x.id === planId);
    if (p) p.status = status;
  }

  async dinners(from: string, to: string) {
    return this.dinnerList.filter((d) => d.date >= from && d.date <= to).sort((a, b) => byDayAndMeal(a, b) || a.id.localeCompare(b.id));
  }
  async dinner(id: string) {
    return this.dinnerList.find((d) => d.id === id) ?? null;
  }
  async addDinner(d: NewDinner) {
    const row: StoredDinner = { ...d, meal: d.meal ?? "dinner", pushCount: d.pushCount ?? 0, id: this.id("dinner"), status: "planned", movedTo: null };
    this.dinnerList.push(row);
    return row;
  }
  async updateDinner(id: string, patch: DinnerPatch) {
    const d = this.dinnerList.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
  }
  async deleteDinner(id: string) {
    this.dinnerList = this.dinnerList.filter((d) => d.id !== id);
  }

  async groceryWeek(weekStart: string): Promise<GroceryWeek> {
    const meals = (await this.dinners(weekStart, addDays(weekStart, 6)))
      .filter((d) => d.status === "planned" || d.status === "cooked")
      .map((d) => {
        const r = this.recipes.find((x) => x.id === d.recipeId);
        return {
          id: d.id,
          date: d.date,
          meal: d.meal,
          title: r?.title ?? "a deleted recipe",
          scale: d.servings / (r?.servings || 2),
          lines: (r?.ingredients ?? []).map((raw) => {
            const p = parseIngredientLine(raw);
            return { raw, name: p.name, quantity: p.quantity, unit: p.unit, aisle: p.name ? (this.aisles.get(matchKey(p.name)) ?? null) : null };
          }),
        };
      });
    return { meals, marks: [...(this.groceryMarks.get(weekStart) ?? [])] };
  }
  private marksFor(weekStart: string) {
    let m = this.groceryMarks.get(weekStart);
    if (!m) this.groceryMarks.set(weekStart, (m = []));
    return m;
  }
  async checkGroceryItem(weekStart: string, key: string, checked: boolean) {
    const marks = this.marksFor(weekStart);
    const m = marks.find((x) => x.key === key);
    if (m) m.checked = checked;
    else marks.push({ key, label: null, aisle: null, checked });
  }
  async setGroceryStatus(weekStart: string, key: string, status: GroceryStatus | null) {
    const marks = this.marksFor(weekStart);
    const m = marks.find((x) => x.key === key);
    if (m) m.status = status;
    else marks.push({ key, label: null, aisle: null, checked: false, status });
  }
  async addGroceryItem(weekStart: string, label: string, aisle: Aisle | null) {
    const key = extraKey(label);
    const marks = this.marksFor(weekStart);
    const m = marks.find((x) => x.key === key);
    if (m) Object.assign(m, { label, aisle, checked: false });
    else marks.push({ key, label, aisle, checked: false });
    return key;
  }
  async removeGroceryItem(weekStart: string, key: string) {
    this.groceryMarks.set(weekStart, this.marksFor(weekStart).filter((m) => m.key !== key));
  }
  async setIngredientAisle(name: string, aisle: Aisle | null) {
    const key = matchKey(name);
    const used = this.recipes.some((r) => r.ingredients.some((l) => matchKey(parseIngredientLine(l).name ?? "") === key));
    if (!used) return 0;
    if (aisle) this.aisles.set(key, aisle);
    else this.aisles.delete(key);
    return 1;
  }

  async notes() {
    return [...this.noteList];
  }
  async addNote(note: Omit<ChefNote, "id">) {
    const row = { ...note, id: this.id("note") };
    this.noteList.push(row);
    return row;
  }
  async forgetNote(id: string) {
    this.noteList = this.noteList.filter((n) => n.id !== id);
  }
}
