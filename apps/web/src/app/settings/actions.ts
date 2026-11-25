"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/household";
import { cleanTag, renameTags, tagKey } from "@/lib/tags";
import { validTimeZone } from "@/lib/settings-shared";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const SAMPLE: Result = { ok: false, error: "This is the sample app, so nothing saves." };

type Db = Awaited<ReturnType<typeof createClient>>;
type SignedIn = Extract<Awaited<ReturnType<typeof getViewer>>, { kind: "signed-in" }>;
type Member = { fail: null; viewer: SignedIn; db: Db } | { fail: Result };
type InHousehold = { fail: null; viewer: SignedIn; db: Db; household: NonNullable<SignedIn["household"]> } | { fail: Result };

async function member(): Promise<Member> {
  const viewer = await getViewer();
  if (viewer.kind === "sample") return { fail: SAMPLE };
  if (viewer.kind !== "signed-in") return { fail: { ok: false, error: "Sign in first." } };
  return { fail: null, viewer, db: await createClient() };
}

async function household(): Promise<InHousehold> {
  const m = await member();
  if (m.fail) return { fail: m.fail };
  if (!m.viewer.household) return { fail: { ok: false, error: "Start a household first." } };
  return { ...m, household: m.viewer.household };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function saveEmailPrefs(prefs: { thursday: boolean; sunday: boolean }): Promise<Result> {
  const m = await member();
  if (m.fail) return m.fail;
  const { error } = await m.db
    .from("profiles")
    .update({ checkin_thursday: prefs.thursday === true, checkin_sunday: prefs.sunday === true })
    .eq("id", m.viewer.userId);
  if (error) return { ok: false, error: "That didn't save. Try again?" };
  refresh();
  return { ok: true, message: "Saved." };
}

/**
 * Deletes the signed-in account for good. If nobody else is in the household,
 * its recipe photos go first (files aren't rows), then the database removes
 * the household and the account in one step.
 */
export async function deleteAccount(confirmText: string): Promise<Result> {
  const m = await member();
  if (m.fail) return m.fail;
  if (typeof confirmText !== "string" || confirmText.trim().toLowerCase() !== "delete") {
    return { ok: false, error: "Type delete to confirm." };
  }
  if (m.viewer.isAdmin) {
    return { ok: false, error: "You're an admin, so this account can't be deleted here. Remove the admin flag in the database first." };
  }

  const h = m.viewer.household;
  if (h && h.memberCount <= 1) {
    const admin = createAdminClient();
    if (admin) {
      const bucket = admin.storage.from("recipe-photos");
      for (let i = 0; i < 20; i++) {
        const { data } = await bucket.list(h.id, { limit: 1000 });
        if (!data?.length) break;
        const { error } = await bucket.remove(data.map((f) => `${h.id}/${f.name}`));
        if (error) break;
      }
    }
  }

  const { error } = await m.db.rpc("delete_my_account");
  if (error) {
    if (/admin_cannot_delete/.test(error.message)) return { ok: false, error: "Admins can't delete their account here." };
    return { ok: false, error: "Couldn't delete your account. Nothing was changed. Try again?" };
  }
  try {
    await m.db.auth.signOut();
  } catch {
    // The account is gone either way; the session cookie no longer works.
  }
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

export async function renameHousehold(name: string): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 80) return { ok: false, error: "Give it a name (up to 80 characters)." };
  const { error } = await m.db.from("households").update({ name: clean }).eq("id", m.household.id);
  if (error) return { ok: false, error: "That didn't save. Try again?" };
  refresh();
  return { ok: true, message: "Renamed." };
}

export async function revokeInvite(inviteId: string): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const { error } = await m.db.from("household_invites").delete().eq("id", String(inviteId)).eq("household_id", m.household.id).is("accepted_at", null);
  if (error) return { ok: false, error: "Couldn't turn that link off. Try again?" };
  refresh();
  return { ok: true, message: "Link turned off." };
}

export async function removeMember(userId: string): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const { error } = await m.db.rpc("remove_household_member", { member_id: String(userId) });
  if (error) return { ok: false, error: /owner/.test(error.message) ? "Only the household's owner can remove someone." : "Couldn't remove them. Try again?" };
  refresh();
  return { ok: true, message: "Removed from the household." };
}

export async function leaveHousehold(): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const { error } = await m.db.rpc("leave_household");
  if (error) {
    return { ok: false, error: /last_member/.test(error.message) ? "You're the only one here, so there's no one to leave it to." : "Couldn't leave. Try again?" };
  }
  redirect("/");
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type PlanningInput = {
  mealsPerWeek: number;
  baseServings: number;
  kidsExtraServings: number;
  noRepeatWeeks: number;
  timezone: string;
};

const inRange = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

export async function savePlanning(input: PlanningInput): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  if (
    !inRange(input?.mealsPerWeek, 1, 7) ||
    !inRange(input.baseServings, 1, 12) ||
    !inRange(input.kidsExtraServings, 0, 12) ||
    !inRange(input.noRepeatWeeks, 0, 12) ||
    !validTimeZone(input.timezone)
  ) {
    return { ok: false, error: "One of those values is out of range." };
  }
  const { error } = await m.db
    .from("household_settings")
    .update({
      dinners_per_week: input.mealsPerWeek,
      base_servings: input.baseServings,
      kids_extra_servings: input.kidsExtraServings,
      no_repeat_weeks: input.noRepeatWeeks,
      timezone: input.timezone,
      updated_at: new Date().toISOString(),
    })
    .eq("household_id", m.household.id);
  if (error) return { ok: false, error: "That didn't save. Try again?" };
  refresh();
  return { ok: true, message: "Saved. Chef uses this next time it plans." };
}

/** A food preference (diet, allergy, dislike) Chef keeps in mind, same as telling it in the chat. */
export async function addPreference(body: string): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const clean = String(body ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, error: "Write the preference first." };
  if (clean.length > 200) return { ok: false, error: "Keep it under 200 characters." };
  const { error } = await m.db.from("chef_notes").insert({
    household_id: m.household.id,
    source: "you_said",
    category: "tastes",
    body: clean,
    created_by: m.viewer.userId,
  });
  if (error) return { ok: false, error: "That didn't save. Try again?" };
  refresh();
  return { ok: true, message: "Chef will keep that in mind." };
}

export async function forgetPreference(noteId: string): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const { error } = await m.db.from("chef_notes").update({ active: false }).eq("id", String(noteId)).eq("household_id", m.household.id);
  if (error) return { ok: false, error: "Couldn't remove that. Try again?" };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tags (rename and merge live in app/recipes/tags/actions.ts)
// ---------------------------------------------------------------------------

type RecipeTags = { id: string; tags: string[] };

async function householdRecipes(m: { db: Db; household: { id: string } }, opts: { includeDeleted: boolean }) {
  let q = m.db.from("recipes").select("id, tags").eq("household_id", m.household.id);
  if (!opts.includeDeleted) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) return null;
  return (data ?? []).map((r) => ({ id: r.id as string, tags: (r.tags ?? []) as string[] }));
}

async function writeTags(m: { db: Db }, changes: RecipeTags[]): Promise<number> {
  const results = await Promise.all(changes.map((c) => m.db.from("recipes").update({ tags: c.tags }).eq("id", c.id)));
  if (changes.length) refresh();
  return results.filter((r) => r.error).length;
}

const plural = (n: number) => `${n} ${n === 1 ? "recipe" : "recipes"}`;

/** Takes these tags off every recipe in the household. The recipes stay. */
export async function deleteTags(names: string[]): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const keys = new Set((Array.isArray(names) ? names : []).filter((t) => typeof t === "string").map(tagKey).filter(Boolean));
  if (!keys.size) return { ok: false, error: "Pick a tag first." };
  // Deleted recipes too, so restoring one doesn't bring the tag back.
  const recipes = await householdRecipes(m, { includeDeleted: true });
  if (!recipes) return { ok: false, error: "Couldn't read your recipes. Try again?" };
  const changes = recipes
    .map((r) => ({ id: r.id, tags: r.tags.filter((t) => !keys.has(tagKey(t))) }))
    .filter((c, i) => c.tags.length !== recipes[i].tags.length);
  const failed = await writeTags(m, changes);
  if (failed) return { ok: false, error: `${changes.length - failed} recipes updated, ${failed} couldn't be. Try again?` };
  return { ok: true, message: `Deleted from ${plural(changes.length)}.` };
}

/**
 * Makes `tag` sit on exactly these recipes: added where it's missing, taken
 * off the rest. Used for a new tag and for "Choose recipes" on an existing one.
 */
export async function setTagRecipes(tagRaw: string, recipeIds: string[]): Promise<Result> {
  const m = await household();
  if (m.fail) return m.fail;
  const tag = cleanTag(typeof tagRaw === "string" ? tagRaw : "");
  if (!tag) return { ok: false, error: "Give the tag a name." };
  const want = new Set((Array.isArray(recipeIds) ? recipeIds : []).filter((id) => typeof id === "string"));
  if (!want.size) return { ok: false, error: "Pick at least one recipe." };
  // Only recipes in the library: the picker doesn't show deleted ones.
  const recipes = await householdRecipes(m, { includeDeleted: false });
  if (!recipes) return { ok: false, error: "Couldn't read your recipes. Try again?" };
  const key = tagKey(tag);
  const changes: RecipeTags[] = [];
  let added = 0;
  let removed = 0;
  for (const r of recipes) {
    const has = r.tags.some((t) => tagKey(t) === key);
    if (want.has(r.id) && !has) {
      changes.push({ id: r.id, tags: [...r.tags, tag] });
      added++;
    } else if (!want.has(r.id) && has) {
      changes.push({ id: r.id, tags: r.tags.filter((t) => tagKey(t) !== key) });
      removed++;
    } else if (want.has(r.id)) {
      // Keep the spelling the person typed for this tag everywhere.
      const next = renameTags(r.tags, [tag], tag);
      if (next) changes.push({ id: r.id, tags: next });
    }
  }
  const failed = await writeTags(m, changes);
  if (failed) return { ok: false, error: `${changes.length - failed} recipes updated, ${failed} couldn't be. Try again?` };
  const parts = [added && `added to ${plural(added)}`, removed && `taken off ${plural(removed)}`].filter(Boolean).join(", ");
  return { ok: true, message: parts ? `“${tag}”: ${parts}.` : `“${tag}” is already on those recipes.` };
}
