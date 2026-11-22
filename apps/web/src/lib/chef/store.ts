/**
 * What Chef reads and changes. The app uses the Supabase version (acting as
 * the signed-in person, so row-level security still applies); tests and the
 * sample preview use the in-memory one.
 */
import type { CatalogRecipe } from "./planner";
import type { ShareTier } from "./ingredient-tier";

export type DinnerStatus = "planned" | "cooked" | "skipped" | "moved";
/** Which meal of the day. Most planned meals are dinners. */
export type MealType = "breakfast" | "lunch" | "dinner";
export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];
export const isMealType = (v: unknown): v is MealType => MEAL_TYPES.includes(v as MealType);
/** Orders meals by day, then breakfast, lunch, dinner. */
export function byDayAndMeal<T extends { date: string; meal?: MealType }>(a: T, b: T): number {
  return a.date.localeCompare(b.date) || MEAL_TYPES.indexOf(a.meal ?? "dinner") - MEAL_TYPES.indexOf(b.meal ?? "dinner");
}
export type PlanStatus = "draft" | "approved";
export type NoteCategory = "household" | "tastes" | "habits";

export type StoredDinner = {
  id: string;
  planId: string;
  date: string;
  /** Breakfast, lunch or dinner. */
  meal: MealType;
  recipeId: string;
  sharedWithKids: boolean;
  servings: number;
  status: DinnerStatus;
  movedTo: string | null;
  /** How many times this dinner was pushed to a later week (0 for a fresh one). */
  pushCount: number;
};

export type NewDinner = Omit<StoredDinner, "id" | "status" | "movedTo" | "pushCount" | "meal"> & { pushCount?: number; meal?: MealType };
export type DinnerPatch = Partial<Pick<StoredDinner, "recipeId" | "sharedWithKids" | "servings" | "status" | "movedTo">>;

export type StoredPlan = { id: string; weekStart: string; status: PlanStatus };

export type ChefNote = { id: string; source: "you_said" | "learned"; category: NoteCategory; body: string };

export type HouseholdSettings = {
  timezone: string;
  dinnersPerWeek: number;
  baseServings: number;
  kidsExtraServings: number;
  noRepeatWeeks: number;
};

export type RecipeFacts = {
  id: string;
  title: string;
  servings: number;
  totalMinutes: number | null;
  tags: string[];
  ingredients: string[];
  stepCount: number;
};

/** A new recipe, as Chef or a recipe page hands it over. */
export type NewRecipe = {
  title: string;
  sourceUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  tags: string[];
  ingredientLines: string[];
  steps: { title: string | null; body: string }[];
  /** Base ingredient names that spoil within a week or so. */
  perishable: string[];
  notes: string | null;
  photo: { bytes: Uint8Array; contentType: string } | { url: string } | null;
};

export type CreateRecipeResult = { ok: true; id: string; title: string; photo: boolean } | { ok: false; error: string };

export interface ChefStore {
  settings(): Promise<HouseholdSettings>;
  catalog(): Promise<CatalogRecipe[]>;
  recipe(id: string): Promise<RecipeFacts | null>;
  createRecipe(recipe: NewRecipe): Promise<CreateRecipeResult>;
  /** Sets how much Chef cares about sharing an ingredient; returns how many ingredients matched. */
  setIngredientTier(name: string, tier: ShareTier): Promise<number>;

  plans(from: string, to: string): Promise<StoredPlan[]>;
  ensurePlan(weekStart: string): Promise<StoredPlan>;
  setPlanStatus(planId: string, status: PlanStatus): Promise<void>;

  dinners(from: string, to: string): Promise<StoredDinner[]>;
  dinner(id: string): Promise<StoredDinner | null>;
  addDinner(d: NewDinner): Promise<StoredDinner>;
  /** Setting status "cooked" also records when and by whom; any other status clears that. */
  updateDinner(id: string, patch: DinnerPatch): Promise<void>;
  deleteDinner(id: string): Promise<void>;

  notes(): Promise<ChefNote[]>;
  addNote(note: Omit<ChefNote, "id">): Promise<ChefNote>;
  forgetNote(id: string): Promise<void>;
}

export const DEFAULT_SETTINGS: HouseholdSettings = {
  timezone: "America/New_York",
  dinnersPerWeek: 5,
  baseServings: 2,
  kidsExtraServings: 2,
  noRepeatWeeks: 3,
};
