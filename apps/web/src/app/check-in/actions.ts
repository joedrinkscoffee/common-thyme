"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCheckIn, signCheckIn } from "@/lib/check-in-link";
import { performCheckIn } from "@/lib/chef/check-in-server";

export type LinkOutcome = { ok: true; text: string; undoToken: string | null } | { ok: false; error: string };

/** Carries out the answer in a signed email link. No sign-in needed: the signature is the permission. */
export async function answerFromLink(token: string): Promise<LinkOutcome> {
  const secret = process.env.CRON_SECRET;
  const admin = createAdminClient();
  if (!secret || !admin) return { ok: false, error: "Check-in links aren't set up yet." };
  const claim = verifyCheckIn(token, secret);
  if (!claim) return { ok: false, error: "This link has expired. Open Chef to check in instead." };

  const { data: dinner } = await admin.from("planned_dinners").select("household_id").eq("id", claim.dinnerId).maybeSingle();
  if (!dinner) return { ok: false, error: "That meal isn't in your plan anymore." };
  const { data: member } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", dinner.household_id)
    .eq("user_id", claim.userId)
    .maybeSingle();
  if (!member) return { ok: false, error: "This link isn't for your household." };

  const result = await performCheckIn({
    db: admin,
    householdId: dinner.household_id,
    userId: claim.userId,
    dinnerId: claim.dinnerId,
    action: claim.action,
    via: "email",
  });
  if (!result.ok) return { ok: false, error: result.error };
  const undoToken = claim.action === "undo" ? null : signCheckIn({ dinnerId: claim.dinnerId, userId: claim.userId, action: "undo" }, secret);
  return { ok: true, text: result.text, undoToken };
}
