"use server";

import { getViewer } from "@/lib/household";
import { getRecipe, type RecipeLine } from "@/lib/recipes";
import { sampleRecipes } from "@/lib/sample-recipes";

export type RecipePreview = {
  id: string;
  title: string;
  photoUrl: string | null;
  servings: number;
  totalMinutes: number | null;
  sourceUrl: string | null;
  tags: string[];
  notes: string | null;
  deleted: boolean;
  ingredients: RecipeLine[];
  steps: { title: string | null; body: string }[];
};

/** What the Chef page's slide-out shows for one recipe. Reads through the viewer's own access, like the recipe page. */
export async function loadRecipePreview(id: string): Promise<RecipePreview | null> {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") return null;
  const r = viewer.kind === "sample" ? sampleRecipes.find((s) => s.id === id) : await getRecipe(id);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    photoUrl: r.photoUrl,
    servings: r.servings,
    totalMinutes: r.totalMinutes,
    sourceUrl: r.sourceUrl,
    tags: r.tags,
    notes: r.notes,
    deleted: !!r.archivedAt,
    ingredients: r.ingredients,
    steps: r.steps,
  };
}
