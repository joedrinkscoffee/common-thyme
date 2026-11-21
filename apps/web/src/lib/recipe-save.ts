import "server-only";
import { createClient } from "@/lib/supabase/server";
import { matchKey, normalizeUnit, parseIngredientLine } from "@/lib/ingredient-line";
import { validateRecipeEdit, type EditErrors } from "@/lib/recipe-edit";

export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; error: string; errors?: EditErrors; changed?: boolean };

/**
 * Saves an edited recipe. The one write path for recipe edits, used by the
 * recipe page and, from step 4, by Chef's add- and fix-recipe tools.
 * Pass the updatedAt the editor loaded; if someone saved since, nothing is
 * written and `changed` is true.
 */
export async function updateRecipe(recipeId: string, input: unknown, expectedUpdatedAt: string | null): Promise<SaveResult> {
  const checked = validateRecipeEdit(input);
  if (!checked.ok) return { ok: false, error: "A few things need fixing first.", errors: checked.errors };
  const recipe = checked.recipe;

  const supabase = await createClient();
  const { data: current } = await supabase.from("recipes").select("household_id").eq("id", recipeId).maybeSingle();
  if (!current) return { ok: false, error: "That recipe isn't in your household." };

  // Link each line to a known ingredient by its base name, ignoring case and plurals.
  // Names with no match become new household ingredients inside save_recipe.
  const { data: known } = await supabase.from("ingredients").select("id, name").eq("household_id", current.household_id);
  const byKey = new Map((known ?? []).map((i) => [matchKey(i.name), i.id]));

  const { data: updatedAt, error } = await supabase.rpc("save_recipe", {
    recipe_id: recipeId,
    expected_updated_at: expectedUpdatedAt,
    recipe: {
      title: recipe.title,
      source_url: recipe.sourceUrl,
      total_minutes: recipe.totalMinutes,
      base_servings: recipe.servings,
      tags: recipe.tags,
      notes: recipe.notes,
      steps_reconstructed: recipe.stepsReconstructed,
      ingredients: recipe.ingredients.map((i) => ({
        ingredient_id: byKey.get(matchKey(i.name)) ?? null,
        quantity: i.quantity,
        unit: i.unit,
        name: i.name,
        prep: i.prep,
        raw_text: i.rawText,
      })),
      steps: recipe.steps,
    },
  });
  if (error) {
    if (error.message.includes("recipe_changed")) {
      return { ok: false, changed: true, error: "Someone saved this recipe since you opened it. Reload to see their changes." };
    }
    if (error.message.includes("recipe_not_found")) return { ok: false, error: "That recipe isn't in your household." };
    return { ok: false, error: "Couldn't save the recipe. Try again?" };
  }
  return { ok: true, updatedAt: updatedAt as string };
}

/** How many ingredient lines in the household still need splitting into parts. */
export async function countUntidyLines(householdId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("recipe_ingredients")
    .select("id, recipes!inner(household_id)", { count: "exact", head: true })
    .is("name", null)
    .eq("recipes.household_id", householdId);
  return count ?? 0;
}

/**
 * One-time tidy-up for imported lines: splits each into amount, unit, base
 * ingredient and prep, and links it to the base ingredient, so "1 shredded
 * carrot" and "1 carrot, shredded" match the same carrot.
 */
export async function tidyIngredientLines(householdId: string): Promise<{ ok: boolean; tidied: number; error?: string }> {
  const supabase = await createClient();
  const { data: lines, error: readError } = await supabase
    .from("recipe_ingredients")
    .select("id, recipe_id, position, raw_text, quantity, unit, ingredient_id, recipes!inner(household_id), ingredients(perishable)")
    .is("name", null)
    .eq("recipes.household_id", householdId)
    .limit(5000);
  if (readError) return { ok: false, tidied: 0, error: "Couldn't read the ingredient lines." };
  if (!lines?.length) return { ok: true, tidied: 0 };

  const { data: known } = await supabase.from("ingredients").select("id, name").eq("household_id", householdId);
  const byKey = new Map((known ?? []).map((i) => [matchKey(i.name), i.id]));

  type Perishable = { perishable: boolean } | { perishable: boolean }[] | null;
  const parsed = lines.map((l) => {
    const linked = l.ingredients as Perishable;
    const old = Array.isArray(linked) ? linked[0] : linked;
    return { line: l, parts: parseIngredientLine(l.raw_text), wasPerishable: !!old?.perishable };
  });

  // New base ingredients keep the perishable flag of whatever the line pointed at before.
  const missing = new Map<string, { name: string; perishable: boolean }>();
  for (const { parts, wasPerishable } of parsed) {
    if (!parts.name) continue;
    const key = matchKey(parts.name);
    if (byKey.has(key)) continue;
    const seen = missing.get(key);
    missing.set(key, { name: parts.name, perishable: (seen?.perishable ?? false) || wasPerishable });
  }
  if (missing.size) {
    const { data: added, error } = await supabase
      .from("ingredients")
      .insert([...missing.values()].map((m) => ({ household_id: householdId, name: m.name, perishable: m.perishable })))
      .select("id, name");
    if (error) return { ok: false, tidied: 0, error: "Couldn't add the new ingredients." };
    for (const row of added ?? []) byKey.set(matchKey(row.name), row.id);
  }

  const rows = parsed
    .filter(({ parts }) => parts.name)
    .map(({ line, parts }) => ({
      id: line.id,
      recipe_id: line.recipe_id,
      position: line.position,
      raw_text: line.raw_text,
      quantity: parts.quantity ?? line.quantity,
      unit: parts.unit ?? normalizeUnit(line.unit),
      name: parts.name,
      prep: parts.prep,
      ingredient_id: byKey.get(matchKey(parts.name!)) ?? line.ingredient_id,
    }));
  const { error } = await supabase.from("recipe_ingredients").upsert(rows, { onConflict: "id" });
  if (error) return { ok: false, tidied: 0, error: "Couldn't save the tidied lines." };
  return { ok: true, tidied: rows.length };
}
