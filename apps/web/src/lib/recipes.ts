import "server-only";
import { createClient } from "@/lib/supabase/server";
import { normalizeUnit, parseIngredientLine, type Unit } from "@/lib/ingredient-line";

export type RecipeCard = {
  id: string;
  title: string;
  photoUrl: string | null;
  tags: string[];
  totalMinutes: number | null;
  stepsReconstructed: boolean;
};

/** One ingredient line, split into parts. */
export type RecipeLine = {
  raw: string;
  quantity: number | null;
  unit: Unit | null;
  /** The base ingredient ("carrot"), used for matching across recipes. */
  name: string | null;
  /** Prep and size words ("shredded"), shown apart from the ingredient. */
  prep: string | null;
  ingredientId: string | null;
  perishable: boolean;
  /** False for imported lines whose parts were guessed from the text and not saved yet. */
  tidy: boolean;
};

export type RecipeDetail = RecipeCard & {
  sourceUrl: string | null;
  servings: number;
  kidFriendly: boolean;
  notes: string | null;
  /** When it was last saved; the editor sends it back so two saves can't clash. */
  updatedAt: string | null;
  /** Set when the recipe was deleted; it's hidden from lists but can be restored. */
  archivedAt: string | null;
  ingredients: RecipeLine[];
  steps: { title: string | null; body: string }[];
};

/** A line from its saved parts, or, for older lines, parts read from the text. */
export function lineFrom(row: {
  raw_text: string;
  quantity: number | string | null;
  unit: string | null;
  name: string | null;
  prep: string | null;
  ingredient_id: string | null;
  perishable: boolean;
}): RecipeLine {
  const base = { raw: row.raw_text, ingredientId: row.ingredient_id, perishable: row.perishable };
  if (row.name) {
    return {
      ...base,
      quantity: row.quantity === null ? null : Number(row.quantity),
      unit: normalizeUnit(row.unit),
      name: row.name,
      prep: row.prep,
      tidy: true,
    };
  }
  return { ...base, ...parseIngredientLine(row.raw_text), tidy: false };
}

/** The household's ingredients, for the editor's type-ahead. */
export async function listIngredientNames(householdId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ingredients").select("id, name").eq("household_id", householdId).order("name").limit(2000);
  return data ?? [];
}

const PHOTO_TTL_SECONDS = 60 * 60;

async function signPhotos(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = paths.filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (!wanted.length) return urls;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("recipe-photos").createSignedUrls(wanted, PHOTO_TTL_SECONDS);
  for (const row of data ?? []) if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  return urls;
}

/** Every recipe in the household, newest titles alphabetically. */
export async function listRecipes(householdId: string): Promise<RecipeCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("id, title, photo_path, tags, total_minutes, steps_reconstructed")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("title");
  const rows = data ?? [];
  const urls = await signPhotos(rows.map((r) => r.photo_path));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    photoUrl: r.photo_path ? (urls.get(r.photo_path) ?? null) : null,
    tags: r.tags ?? [],
    totalMinutes: r.total_minutes,
    stepsReconstructed: r.steps_reconstructed,
  }));
}

/** One recipe with its ingredients and steps, or null if it isn't in the household. */
export async function getRecipe(id: string): Promise<RecipeDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("recipes")
    .select(
      "id, title, photo_path, tags, total_minutes, steps_reconstructed, source_url, base_servings, kid_friendly, notes, updated_at, archived_at, recipe_ingredients(position, raw_text, quantity, unit, name, prep, ingredient_id, ingredients(perishable)), recipe_steps(position, title, body)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;
  const urls = await signPhotos([r.photo_path]);

  type Line = {
    position: number;
    raw_text: string;
    quantity: number | string | null;
    unit: string | null;
    name: string | null;
    prep: string | null;
    ingredient_id: string | null;
    ingredients: { perishable: boolean } | { perishable: boolean }[] | null;
  };
  type Step = { position: number; title: string | null; body: string };
  const lines = ((r.recipe_ingredients ?? []) as Line[]).sort((a, b) => a.position - b.position);
  const steps = ((r.recipe_steps ?? []) as Step[]).sort((a, b) => a.position - b.position);

  return {
    id: r.id,
    title: r.title,
    photoUrl: r.photo_path ? (urls.get(r.photo_path) ?? null) : null,
    tags: r.tags ?? [],
    totalMinutes: r.total_minutes,
    stepsReconstructed: r.steps_reconstructed,
    sourceUrl: r.source_url,
    servings: r.base_servings,
    kidFriendly: r.kid_friendly,
    notes: r.notes,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
    ingredients: lines.map((l) => {
      const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
      return lineFrom({ ...l, perishable: !!ing?.perishable });
    }),
    steps: steps.map((s) => ({ title: s.title, body: s.body })),
  };
}

/** Every tag the household uses, for the editor's suggestions. */
export async function listTags(householdId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("tags").eq("household_id", householdId).is("archived_at", null);
  return [...new Set((data ?? []).flatMap((r) => (r.tags ?? []) as string[]).map((t) => t.toLowerCase()))].sort();
}

/** How many dinners from today on still plan to cook this recipe. */
export async function countUpcomingDinners(recipeId: string): Promise<number> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from("planned_dinners")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", recipeId)
    .eq("status", "planned")
    .gte("date", today);
  return count ?? 0;
}

/** The title of a recipe deleted moments ago, for the Undo sticker. */
export async function getDeletedTitle(id: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("title").eq("id", id).not("archived_at", "is", null).maybeSingle();
  return data?.title ?? null;
}
