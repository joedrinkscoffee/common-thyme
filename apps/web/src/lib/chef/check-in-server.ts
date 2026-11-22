import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyCheckIn, undoCheckIn, type CheckInAction, type CheckInResult } from "./check-in";
import { todayIn } from "./dates";
import { saveMessage } from "./server";
import { SupabaseChefStore } from "./supabase-store";

const SAID: Record<CheckInAction | "undo", (title: string) => string> = {
  cooked: (t) => `We made ${t}.`,
  later: (t) => `We didn't get to ${t}. Move it to later this week.`,
  next_week: (t) => `Push ${t} to next week.`,
  skip: (t) => `We're skipping ${t}.`,
  undo: () => "Undo that.",
};

/**
 * Answers a check-in for one dinner and adds it to the household's Chef
 * conversation, so the home page shows what happened (with an Undo).
 * `db` is either the signed-in person's client or, for email links, the
 * admin client; both are scoped to `householdId` by the store.
 */
export async function performCheckIn(opts: {
  db: SupabaseClient;
  householdId: string;
  userId: string;
  dinnerId: string;
  action: CheckInAction | "undo";
  today?: string;
  via?: "email";
}): Promise<CheckInResult & { title?: string }> {
  const store = new SupabaseChefStore(opts.db, opts.householdId, opts.userId);
  const today = opts.today ?? todayIn((await store.settings()).timezone);
  const before = await store.dinner(opts.dinnerId);
  const title = before ? ((await store.recipe(before.recipeId))?.title ?? "that dinner") : "that dinner";

  const result = opts.action === "undo" ? await undoCheckIn(store, opts.dinnerId) : await applyCheckIn(store, opts.dinnerId, opts.action, today);
  if (!result.ok) return result;

  const said = SAID[opts.action](title);
  await saveMessage(opts.db, opts.householdId, { role: "user", authorId: opts.userId, body: opts.via === "email" ? `${said} (from email)` : said });
  await saveMessage(opts.db, opts.householdId, {
    role: "chef",
    authorId: null,
    body: result.text,
    payload: { changes: [result.change], ...(opts.action === "undo" ? {} : { undo: result.undo }) },
  });
  return { ...result, title };
}
