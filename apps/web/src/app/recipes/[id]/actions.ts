"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";
import { refresh } from "next/cache";
import { isPhotoPathFor, photoPathFor } from "@/lib/recipe-photo";
import type { RecipeEditInput } from "@/lib/recipe-edit";
import { updateRecipe, type SaveResult } from "@/lib/recipe-save";

export type PhotoTarget = { ok: true; path: string } | { ok: false; error: string };

/** Picks the storage path for a new photo, after checking the recipe is in the viewer's household. */
export async function photoTarget(recipeId: string, contentType: string): Promise<PhotoTarget> {
  const supabase = await createClient();
  const { data: recipe } = await supabase.from("recipes").select("household_id").eq("id", recipeId).maybeSingle();
  if (!recipe) return { ok: false, error: "That recipe isn't in your household." };
  const path = photoPathFor(recipe.household_id, recipeId, contentType, Date.now());
  return path ? { ok: true, path } : { ok: false, error: "Use a JPEG, PNG or WebP photo." };
}

/** Points the recipe at a photo the browser just uploaded, and removes the old one. */
export async function savePhoto(recipeId: string, path: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: recipe } = await supabase.from("recipes").select("household_id, photo_path").eq("id", recipeId).maybeSingle();
  if (!recipe || !isPhotoPathFor(path, recipe.household_id, recipeId)) return { ok: false, error: "That photo doesn't belong to this recipe." };
  const { error } = await supabase.from("recipes").update({ photo_path: path }).eq("id", recipeId);
  if (error) return { ok: false, error: "Couldn't save the photo. Try again?" };
  if (recipe.photo_path && recipe.photo_path !== path) {
    await supabase.storage.from("recipe-photos").remove([recipe.photo_path]);
  }
  return { ok: true };
}

/** Saves the recipe page's edit form. See updateRecipe for the rules. */
export async function saveRecipe(recipeId: string, input: RecipeEditInput, expectedUpdatedAt: string | null): Promise<SaveResult> {
  if (!supabaseEnv()) return { ok: false, error: "This is a sample recipe, so changes can't be saved." };
  const result = await updateRecipe(recipeId, input, expectedUpdatedAt);
  if (result.ok) refresh();
  return result;
}
