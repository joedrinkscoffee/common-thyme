import "server-only";
import { createClient } from "@/lib/supabase/server";

export type RecipeCard = {
  id: string;
  title: string;
  photoUrl: string | null;
  tags: string[];
  totalMinutes: number | null;
  stepsReconstructed: boolean;
};

export type RecipeDetail = RecipeCard & {
  sourceUrl: string | null;
  servings: number;
  notes: string | null;
  ingredients: { raw: string; perishable: boolean }[];
  steps: { title: string | null; body: string }[];
};

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
      "id, title, photo_path, tags, total_minutes, steps_reconstructed, source_url, base_servings, notes, recipe_ingredients(position, raw_text, ingredients(perishable)), recipe_steps(position, title, body)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;
  const urls = await signPhotos([r.photo_path]);

  type Line = { position: number; raw_text: string; ingredients: { perishable: boolean } | { perishable: boolean }[] | null };
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
    notes: r.notes,
    ingredients: lines.map((l) => {
      const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
      return { raw: l.raw_text, perishable: !!ing?.perishable };
    }),
    steps: steps.map((s) => ({ title: s.title, body: s.body })),
  };
}
