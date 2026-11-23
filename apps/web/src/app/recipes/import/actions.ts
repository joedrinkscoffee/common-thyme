"use server";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/household";
import { refresh } from "next/cache";
import { parseRecipe } from "@/lib/recipe-import";
import { downloadPhoto } from "@/lib/photo-fetch";
import { tidyIngredientLines } from "@/lib/recipe-save";
import { listTags } from "@/lib/recipes";
import { canonicalTags } from "@/lib/tags";

export type ImportOneResult =
  | { ok: true; title: string; photo: "saved" | "none" | "failed" }
  | { ok: false; title: string; error: string };

/**
 * Saves one recipe from the import file into the viewer's household, with its
 * ingredients, steps and photo. Re-running it updates the same recipe.
 */
export async function importRecipe(input: unknown): Promise<ImportOneResult> {
  const recipe = parseRecipe(input);
  const fallbackTitle = typeof recipe === "string" ? "Recipe" : recipe.title;
  if (typeof recipe === "string") return { ok: false, title: fallbackTitle, error: recipe };

  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) {
    return { ok: false, title: recipe.title, error: "Sign in and create a household first." };
  }
  const householdId = viewer.household.id;
  const supabase = await createClient();
  const tags = canonicalTags(recipe.tags, await listTags(householdId));
  const fail = (error: string): ImportOneResult => ({ ok: false, title: recipe.title, error });

  const { data: saved, error: recipeError } = await supabase
    .from("recipes")
    .upsert(
      {
        household_id: householdId,
        origin: recipe.origin,
        origin_ref: recipe.ref,
        title: recipe.title,
        source_url: recipe.sourceUrl,
        total_minutes: recipe.totalMinutes,
        base_servings: recipe.servings,
        tags,
        steps_reconstructed: recipe.stepsReconstructed,
        notes: recipe.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "household_id,origin,origin_ref" },
    )
    .select("id, photo_path")
    .single();
  if (recipeError || !saved) return fail("Couldn't save the recipe.");

  // Shopping ingredients are shared across recipes, matched by name.
  const names = [...new Map(recipe.ingredients.filter((i) => i.name).map((i) => [i.name!.toLowerCase(), i])).values()];
  const idByName = new Map<string, string>();
  if (names.length) {
    const { data: existing } = await supabase.from("ingredients").select("id, name").eq("household_id", householdId);
    for (const row of existing ?? []) idByName.set(row.name.toLowerCase(), row.id);
    const missing = names.filter((i) => !idByName.has(i.name!.toLowerCase()));
    if (missing.length) {
      const { data: added, error } = await supabase
        .from("ingredients")
        .insert(missing.map((i) => ({ household_id: householdId, name: i.name!, perishable: i.perishable })))
        .select("id, name");
      if (error) return fail("Couldn't save its ingredients.");
      for (const row of added ?? []) idByName.set(row.name.toLowerCase(), row.id);
    }
  }

  // Replace the ingredient lines and steps, so a re-run matches the file.
  await supabase.from("recipe_ingredients").delete().eq("recipe_id", saved.id);
  await supabase.from("recipe_steps").delete().eq("recipe_id", saved.id);
  if (recipe.ingredients.length) {
    const { error } = await supabase.from("recipe_ingredients").insert(
      recipe.ingredients.map((i, position) => ({
        recipe_id: saved.id,
        position,
        ingredient_id: i.name ? (idByName.get(i.name.toLowerCase()) ?? null) : null,
        quantity: i.quantity,
        unit: i.unit,
        raw_text: i.raw,
      })),
    );
    if (error) return fail("Couldn't save its ingredient list.");
  }
  if (recipe.steps.length) {
    const { error } = await supabase
      .from("recipe_steps")
      .insert(recipe.steps.map((s, position) => ({ recipe_id: saved.id, position, title: s.title, body: s.body })));
    if (error) return fail("Couldn't save its steps.");
  }

  // Keep a photo that's already stored; otherwise copy it in from the source.
  if (saved.photo_path) return { ok: true, title: recipe.title, photo: "saved" };
  if (!recipe.photoUrl) return { ok: true, title: recipe.title, photo: "none" };
  const photo = await downloadPhoto(recipe.photoUrl);
  if (!photo) return { ok: true, title: recipe.title, photo: "failed" };
  const path = `${householdId}/${saved.id}.${photo.ext}`;
  const { error: uploadError } = await supabase.storage
    .from("recipe-photos")
    .upload(path, photo.bytes, { contentType: photo.type, upsert: true });
  if (uploadError) return { ok: true, title: recipe.title, photo: "failed" };
  await supabase.from("recipes").update({ photo_path: path }).eq("id", saved.id);
  return { ok: true, title: recipe.title, photo: "saved" };
}

/** Splits imported ingredient lines into amount, unit, base ingredient and prep. */
export async function tidyIngredients(): Promise<{ ok: boolean; tidied: number; error?: string }> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return { ok: false, tidied: 0, error: "Sign in and create a household first." };
  const result = await tidyIngredientLines(viewer.household.id);
  if (result.ok) refresh();
  return result;
}
