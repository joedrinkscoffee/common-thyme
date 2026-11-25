"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/household";
import { chefContext } from "@/lib/chef/server";
import { fetchCalendar, normalizeCalendarUrl, parseEvents } from "@/lib/chef/calendar";
import { createClient } from "@/lib/supabase/server";

export async function forgetNote(noteId: string): Promise<void> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return;
  const { store } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
  await store.forgetNote(noteId);
  refresh();
}

export type CalendarFormState = { ok: boolean; message: string } | null;

/** Saves the household's private calendar link after checking it can be read. */
export async function saveCalendar(_prev: CalendarFormState, form: FormData): Promise<CalendarFormState> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return { ok: false, message: "Sign in first." };
  const checked = normalizeCalendarUrl(String(form.get("url") ?? ""));
  if (!checked.ok) return { ok: false, message: checked.error };
  const got = await fetchCalendar(checked.url);
  if (!got.ok) return { ok: false, message: got.error };
  try {
    parseEvents(got.text, "2026-01-01", "2026-01-02", "UTC");
  } catch {
    return { ok: false, message: "Couldn't read that calendar file." };
  }
  const { db } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
  const { error } = await db.from("household_calendars").upsert({
    household_id: viewer.household.id,
    ics_url: checked.url,
    created_by: viewer.userId,
    last_read_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, message: "That didn't save. Try again?" };
  refresh();
  return { ok: true, message: "Linked. Chef will check it when it plans." };
}

export async function removeCalendar(): Promise<void> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return;
  const { db } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
  await db.from("household_calendars").delete().eq("household_id", viewer.household.id);
  refresh();
}

export type Result = { ok: true; message?: string } | { ok: false; error: string };

async function householdDb() {
  const viewer = await getViewer();
  if (viewer.kind === "sample") return { fail: { ok: false, error: "This is the sample app, so nothing saves." } as Result };
  if (viewer.kind !== "signed-in" || !viewer.household) return { fail: { ok: false, error: "Sign in first." } as Result };
  return { fail: null, viewer, household: viewer.household, db: await createClient() };
}

export type PlanningInput = { mealsPerWeek: number; baseServings: number; kidsExtraServings: number; noRepeatWeeks: number };

const inRange = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/** How Chef starts each week: meals, servings, kids' extra servings, how long before a recipe repeats. */
export async function savePlanning(input: PlanningInput): Promise<Result> {
  const m = await householdDb();
  if (m.fail) return m.fail;
  if (!inRange(input?.mealsPerWeek, 1, 7) || !inRange(input.baseServings, 1, 12) || !inRange(input.kidsExtraServings, 0, 12) || !inRange(input.noRepeatWeeks, 0, 12)) {
    return { ok: false, error: "One of those values is out of range." };
  }
  const { error } = await m.db
    .from("household_settings")
    .update({
      dinners_per_week: input.mealsPerWeek,
      base_servings: input.baseServings,
      kids_extra_servings: input.kidsExtraServings,
      no_repeat_weeks: input.noRepeatWeeks,
      updated_at: new Date().toISOString(),
    })
    .eq("household_id", m.household.id);
  if (error) return { ok: false, error: "That didn't save. Try again?" };
  refresh();
  return { ok: true, message: "Saved. Chef uses this next time it plans." };
}

/** A food preference (diet, allergy, dislike) Chef keeps in mind, same as telling it in the chat. */
export async function addPreference(body: string): Promise<Result> {
  const m = await householdDb();
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
  const m = await householdDb();
  if (m.fail) return m.fail;
  const { error } = await m.db.from("chef_notes").update({ active: false }).eq("id", String(noteId)).eq("household_id", m.household.id);
  if (error) return { ok: false, error: "Couldn't remove that. Try again?" };
  refresh();
  return { ok: true };
}
