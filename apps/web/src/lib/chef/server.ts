import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { firstNames } from "@/lib/supabase/rows";
import { addDays, hourIn, todayIn, weekStartOf } from "./dates";
import { buildHome, type ChefHomeData, type HomeMessage } from "./home";
import type { Choice } from "./session";
import { SupabaseChefStore } from "./supabase-store";
import { ensureDrafts } from "./auto-draft";
import { calendarNights, fetchCalendar, parseEvents, type CalendarNight } from "./calendar";

export type HouseholdViewer = {
  userId: string;
  firstName: string | null;
  household: { id: string; name: string; memberCount: number };
};

export const chefConnected = () => !!process.env.ANTHROPIC_API_KEY;

/** The household's database and Chef store, without reading its settings. Enough for a quick save. */
export async function householdStore(viewer: HouseholdViewer) {
  const db = await createClient();
  return { db, store: new SupabaseChefStore(db, viewer.household.id, viewer.userId) };
}

/** householdStore plus the household's settings and today's date in its time zone. */
export async function chefContext(viewer: HouseholdViewer) {
  const { db, store } = await householdStore(viewer);
  const settings = await store.settings();
  return { db, store, settings, today: todayIn(settings.timezone), hour: hourIn(settings.timezone) };
}

type MessageRow = {
  id: string;
  role: "chef" | "user";
  author_id: string | null;
  body: string;
  payload: { choice?: Choice; changes?: string[]; undo?: string; grocery?: string | null } | null;
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
  const names = await firstNames(db, rows.map((r) => r.author_id));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    author: r.author_id ? (names.get(r.author_id) ?? "Someone") : null,
    body: r.body,
    choice: r.payload?.choice ?? null,
    changes: r.payload?.changes ?? [],
    undo: r.payload?.undo ?? null,
    grocery: r.payload?.grocery ?? null,
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

export type CalendarLink = { url: string; lastReadAt: string | null; lastError: string | null };

export async function calendarLink(db: SupabaseClient, householdId: string): Promise<CalendarLink | null> {
  const { data } = await db.from("household_calendars").select("ics_url, last_read_at, last_error").eq("household_id", householdId).maybeSingle();
  return data ? { url: data.ics_url, lastReadAt: data.last_read_at, lastError: data.last_error } : null;
}

/**
 * The nights the household's calendar changes over the next four weeks:
 * null when no calendar is linked, empty when it couldn't be read.
 */
export async function loadCalendarNights(db: SupabaseClient, householdId: string, timeZone: string, today: string): Promise<CalendarNight[] | null> {
  const link = await calendarLink(db, householdId);
  if (!link) return null;
  const got = await fetchCalendar(link.url);
  let nights: CalendarNight[] = [];
  let error: string | null = got.ok ? null : got.error;
  if (got.ok) {
    try {
      nights = calendarNights(parseEvents(got.text, today, addDays(weekStartOf(today), 27), timeZone));
    } catch {
      error = "Couldn't read that calendar file.";
    }
  }
  await db
    .from("household_calendars")
    .update({ last_read_at: new Date().toISOString(), last_error: error })
    .eq("household_id", householdId);
  return nights;
}

/** The Chef home for a signed-in household. */
export async function loadChefHome(viewer: HouseholdViewer): Promise<ChefHomeData> {
  const { db, store, today, hour, settings } = await chefContext(viewer);
  // Chef always has a draft: fill an empty week before showing the page.
  try {
    const drafts = await ensureDrafts({
      store,
      today,
      calendar: () => loadCalendarNights(db, viewer.household.id, settings.timezone, today),
      hasDrafted: async (weekStart) => {
        const { data } = await db
          .from("chef_messages")
          .select("id")
          .eq("household_id", viewer.household.id)
          .eq("payload->>autoDraft", weekStart)
          .limit(1);
        return !!data?.length;
      },
    });
    for (const d of drafts) {
      await saveMessage(db, viewer.household.id, {
        role: "chef",
        authorId: null,
        body: d.body,
        payload: { autoDraft: d.weekStart, choice: d.choice, changes: d.changes },
      });
    }
  } catch (e) {
    console.error("chef auto-draft", e);
  }
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
