"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/household";
import { chefContext, saveMessage } from "@/lib/chef/server";

/** A quick check-in answer, without asking the model: "cooked it" or "skipped it". */
export async function checkInDinner(dinnerId: string, status: "cooked" | "skipped"): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return { ok: false, error: "Sign in first." };
  const { db, store, today } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });

  const { data: d } = await db
    .from("planned_dinners")
    .select("id, date, status, recipes(title)")
    .eq("id", dinnerId)
    .eq("household_id", viewer.household.id)
    .maybeSingle();
  if (!d || d.status !== "planned") return { ok: false, error: "That dinner was already checked in." };
  if (status === "cooked" && d.date > today) return { ok: false, error: "That dinner is still ahead." };
  const recipe = (Array.isArray(d.recipes) ? d.recipes[0] : d.recipes) as { title: string } | null;
  const title = recipe?.title ?? "that dinner";

  await store.updateDinner(dinnerId, { status });
  const household = viewer.household.id;
  await saveMessage(db, household, { role: "user", authorId: viewer.userId, body: status === "cooked" ? `We made ${title}.` : `We skipped ${title}.` });
  await saveMessage(db, household, {
    role: "chef",
    authorId: null,
    body: status === "cooked" ? `Nice. ${title} is marked cooked.` : `Got it, ${title} is skipped. If you'd still like to make it, ask me to move it to another night.`,
    payload: { changes: [status === "cooked" ? `Marked ${title} cooked` : `Marked ${title} skipped`] },
  });
  refresh();
  return { ok: true };
}
