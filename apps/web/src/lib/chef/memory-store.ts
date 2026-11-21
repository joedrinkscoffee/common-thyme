import type { CatalogRecipe } from "./planner";
import { DEFAULT_SETTINGS, type ChefNote, type ChefStore, type HouseholdSettings, type NewRecipe, type RecipeFacts, type StoredDinner, type StoredPlan } from "./store";

type MemoryRecipe = CatalogRecipe & { servings: number; ingredients: string[]; stepCount: number };

/** An in-memory household, for tests and the sample preview. */
export class MemoryStore implements ChefStore {
  recipes: MemoryRecipe[];
  plansList: StoredPlan[] = [];
  dinnerList: StoredDinner[] = [];
  noteList: ChefNote[] = [];
  created: NewRecipe[] = [];
  private n = 0;

  constructor(
    recipes: (CatalogRecipe & Partial<MemoryRecipe>)[],
    private household: HouseholdSettings = DEFAULT_SETTINGS,
  ) {
    this.recipes = recipes.map((r) => ({ servings: 2, ingredients: r.perishables, stepCount: 3, ...r }));
  }

  private id(prefix: string) {
    this.n += 1;
    return `${prefix}-${String(this.n).padStart(4, "0")}`;
  }

  async settings() {
    return this.household;
  }
  async catalog() {
    return this.recipes.map(({ id, title, tags, totalMinutes, perishables }) => ({ id, title, tags, totalMinutes, perishables }));
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
      perishables: recipe.perishable.map((p) => p.toLowerCase()),
      servings: recipe.servings,
      ingredients: recipe.ingredientLines,
      stepCount: recipe.steps.length,
    });
    return { ok: true as const, id, title: recipe.title, photo: !!recipe.photo };
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
    return this.dinnerList.filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }
  async addDinner(d: Omit<StoredDinner, "id" | "status" | "movedTo">) {
    const row: StoredDinner = { ...d, id: this.id("dinner"), status: "planned", movedTo: null };
    this.dinnerList.push(row);
    return row;
  }
  async updateDinner(id: string, patch: Partial<StoredDinner>) {
    const d = this.dinnerList.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
  }
  async deleteDinner(id: string) {
    this.dinnerList = this.dinnerList.filter((d) => d.id !== id);
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
