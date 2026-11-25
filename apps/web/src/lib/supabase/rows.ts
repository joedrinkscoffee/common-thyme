import type { SupabaseClient } from "@supabase/supabase-js";

/** Small helpers for reading Supabase rows. */

/** A joined row arrives as an object, an array or null depending on the relation; this gives the first one. */
export type One<T> = T | T[] | null | undefined;
export const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** "Joe" from "Joe Perro". */
export const firstNameOf = (fullName: string | null | undefined): string | null => (fullName ? fullName.split(" ")[0] : null);

/** First names for profile ids, for "checked by Joe" and chat authors. Unknown ids are left out. */
export async function firstNames(db: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (!wanted.length) return names;
  const { data } = await db.from("profiles").select("id, display_name").in("id", wanted);
  for (const p of data ?? []) {
    const name = firstNameOf(p.display_name);
    if (name) names.set(p.id, name);
  }
  return names;
}
