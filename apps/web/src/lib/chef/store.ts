/**
 * What Chef reads and changes. The app uses the Supabase version (acting as
 * the signed-in person, so row-level security still applies); tests and the
 * sample preview use the in-memory one.
 */
import type { CatalogRecipe } from "./planner";

export type DinnerStatus = "planned" | "cooked" | "skipped" | "moved";
export type PlanStatus = "draft" | "approved";
export type NoteCategory = "household" | "tastes" | "habits";

export type StoredDinner = {
  id: string;
  planId: string;
  date: string;
  recipeId: string;
  sharedWithKids: boolean;
  servings: number;
  status: DinnerStatus;
  movedTo: string | null;
};

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

  plans(from: string, to: string): Promise<StoredPlan[]>;
  ensurePlan(weekStart: string): Promise<StoredPlan>;
  setPlanStatus(planId: string, status: PlanStatus): Promise<void>;

  dinners(from: string, to: string): Promise<StoredDinner[]>;
  addDinner(d: Omit<StoredDinner, "id" | "status" | "movedTo">): Promise<StoredDinner>;
  updateDinner(id: string, patch: Partial<Pick<StoredDinner, "recipeId" | "sharedWithKids" | "servings" | "status" | "movedTo">>): Promise<void>;
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
