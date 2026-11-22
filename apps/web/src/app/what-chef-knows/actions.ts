"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/household";
import { chefContext } from "@/lib/chef/server";
import { fetchCalendar, normalizeCalendarUrl, parseEvents } from "@/lib/chef/calendar";

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
