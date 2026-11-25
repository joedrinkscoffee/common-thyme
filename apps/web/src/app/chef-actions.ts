"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { CHECK_IN_ACTIONS, type CheckInAction } from "@/lib/chef/check-in";
import { performCheckIn } from "@/lib/chef/check-in-server";
import { validTimeZone } from "@/lib/settings-shared";

type Outcome = { ok: boolean; error?: string };

/** A check-in answer for one dinner, without asking the model: cooked, later this week, next week or skip. */
export async function checkInDinner(dinnerId: string, action: CheckInAction | "undo"): Promise<Outcome> {
  if (action !== "undo" && !CHECK_IN_ACTIONS.includes(action)) return { ok: false, error: "Unknown answer." };
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return { ok: false, error: "Sign in first." };
  const db = await createClient();
  const result = await performCheckIn({ db, householdId: viewer.household.id, userId: viewer.userId, dinnerId, action });
  if (!result.ok) return { ok: false, error: result.error };
  refresh();
  return { ok: true };
}

/** Remembers the browser's time zone, so reminder emails arrive at the right local hour. */
export async function saveTimezone(timeZone: string): Promise<Outcome> {
  if (!validTimeZone(timeZone)) return { ok: false };
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in") return { ok: false };
  const db = await createClient();
  const { error } = await db.from("profiles").update({ timezone: timeZone }).eq("id", viewer.userId);
  return { ok: !error };
}
