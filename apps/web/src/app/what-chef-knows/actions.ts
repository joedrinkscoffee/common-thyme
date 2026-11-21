"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/household";
import { chefContext } from "@/lib/chef/server";

export async function forgetNote(noteId: string): Promise<void> {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.household) return;
  const { store } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
  await store.forgetNote(noteId);
  refresh();
}
