"use server";

import { getViewer } from "@/lib/household";
import { refresh } from "next/cache";
import { tidyIngredientLines } from "@/lib/recipe-save";

/** Splits imported ingredient lines into amount, unit, base ingredient and prep. */
export async function tidyIngredients(): Promise<{ ok: boolean; tidied: number; error?: string }> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return { ok: false, tidied: 0, error: "Sign in and create a household first." };
  const result = await tidyIngredientLines(viewer.household.id);
  if (result.ok) refresh();
  return result;
}
