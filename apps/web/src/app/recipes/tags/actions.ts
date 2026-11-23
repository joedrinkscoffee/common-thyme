"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/household";
import { cleanTag, renameTags } from "@/lib/tags";

export type MergeResult = { ok: true; to: string; updated: number } | { ok: false; error: string };

/**
 * Renames one tag, or merges several into one, on every recipe in the
 * household (deleted ones too, so a restored recipe matches). Merging into a
 * tag that already exists is fine; recipes end up with it once.
 */
export async function mergeTags(from: string[], toRaw: string): Promise<MergeResult> {
  const viewer = await getViewer();
  if (viewer.kind === "sample") return { ok: false, error: "These are sample recipes, so tags can't be changed." };
  if (viewer.kind !== "signed-in" || !viewer.household) return { ok: false, error: "Sign in to change tags." };
  const to = cleanTag(typeof toRaw === "string" ? toRaw : "");
  const names = (Array.isArray(from) ? from : []).filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 100);
  if (!to) return { ok: false, error: "Give the tag a name." };
  if (!names.length) return { ok: false, error: "Pick at least one tag." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("recipes").select("id, tags").eq("household_id", viewer.household.id);
  if (error) return { ok: false, error: "Couldn't read your recipes. Try again?" };

  const changes = (data ?? [])
    .map((r) => ({ id: r.id as string, tags: renameTags((r.tags ?? []) as string[], names, to) }))
    .filter((c): c is { id: string; tags: string[] } => c.tags !== null);
  const results = await Promise.all(changes.map((c) => supabase.from("recipes").update({ tags: c.tags }).eq("id", c.id)));
  const failed = results.filter((r) => r.error).length;
  if (changes.length) refresh();
  if (failed) return { ok: false, error: `${changes.length - failed} recipes updated, ${failed} couldn't be. Try again?` };
  return { ok: true, to, updated: changes.length };
}
