import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDays, hourIn, todayIn, weekStartOf } from "./dates";
import { buildHome, type ChefHomeData, type HomeMessage } from "./home";
import type { Choice } from "./session";
import { SupabaseChefStore } from "./supabase-store";

export type HouseholdViewer = {
  userId: string;
  firstName: string | null;
  household: { id: string; name: string; memberCount: number };
};

export const chefConnected = () => !!process.env.ANTHROPIC_API_KEY;

export async function chefContext(viewer: HouseholdViewer) {
  const db = await createClient();
  const store = new SupabaseChefStore(db, viewer.household.id, viewer.userId);
  const settings = await store.settings();
  return { db, store, settings, today: todayIn(settings.timezone), hour: hourIn(settings.timezone) };
}

type MessageRow = {
  id: string;
  role: "chef" | "user";
  author_id: string | null;
  body: string;
  payload: { choice?: Choice; changes?: string[] } | null;
  created_at: string;
};

/** The household's recent conversation, oldest first. */
export async function loadMessages(db: SupabaseClient, householdId: string, opts: { since?: string; limit: number }): Promise<HomeMessage[]> {
  let q = db
    .from("chef_messages")
    .select("id, role, author_id, body, payload, created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(opts.limit);
  if (opts.since) q = q.gte("created_at", opts.since);
  const { data } = await q;
  const rows = ((data ?? []) as MessageRow[]).reverse();
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (authorIds.length) {
    const { data: people } = await db.from("profiles").select("id, display_name").in("id", authorIds);
    for (const p of people ?? []) if (p.display_name) names.set(p.id, p.display_name.split(" ")[0]);
  }
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    author: r.author_id ? (names.get(r.author_id) ?? "Someone") : null,
    body: r.body,
    choice: r.payload?.choice ?? null,
    changes: r.payload?.changes ?? [],
    at: r.created_at,
  }));
}

export async function saveMessage(
  db: SupabaseClient,
  householdId: string,
  msg: { role: "chef" | "user"; authorId: string | null; body: string; payload?: Record<string, unknown> | null },
): Promise<string | null> {
  const { data, error } = await db
    .from("chef_messages")
    .insert({ household_id: householdId, role: msg.role, author_id: msg.authorId, body: msg.body, payload: msg.payload ?? null })
    .select("id, created_at")
    .single();
  if (error) console.error("save chef message", error.message);
  return data?.id ?? null;
}

export async function signedPhotoUrls(db: SupabaseClient, recipeIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!recipeIds.length) return out;
  const { data: rows } = await db.from("recipes").select("id, photo_path").in("id", recipeIds);
  const withPhoto = (rows ?? []).filter((r) => r.photo_path);
  if (!withPhoto.length) return out;
  const { data } = await db.storage.from("recipe-photos").createSignedUrls(withPhoto.map((r) => r.photo_path as string), 3600);
  const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  for (const r of withPhoto) {
    const url = byPath.get(r.photo_path);
    if (url) out.set(r.id, url);
  }
  return out;
}

/** The Chef home for a signed-in household. */
export async function loadChefHome(viewer: HouseholdViewer): Promise<ChefHomeData> {
  const { db, store, today, hour } = await chefContext(viewer);
  // This week's conversation (from last Monday), up to 30 messages.
  const since = `${addDays(weekStartOf(today), -1)}T00:00:00Z`;
  const messages = await loadMessages(db, viewer.household.id, { since, limit: 30 });
  return buildHome({
    store,
    today,
    hour,
    firstName: viewer.firstName,
    connected: chefConnected(),
    messages,
    photoUrls: (ids) => signedPhotoUrls(db, ids),
  });
}
