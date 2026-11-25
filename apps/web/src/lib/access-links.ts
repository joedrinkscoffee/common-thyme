import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Invite codes are letters and digits only; anything else can't match. */
export function cleanCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
}

export type LinkState = "open" | "expired" | "used" | "invalid";

export function linkState(link: { max_uses: number; use_count: number; expires_at: string; revoked_at: string | null } | null, now = Date.now()): LinkState {
  if (!link || link.revoked_at) return "invalid";
  if (link.use_count >= link.max_uses) return "used";
  if (Date.parse(link.expires_at) <= now) return "expired";
  return "open";
}

/**
 * Whether an invite link still works, so the page can say so before someone
 * goes through Google. Signing in through it is what the database checks.
 */
export async function accessLinkState(code: string): Promise<LinkState> {
  if (!code) return "invalid";
  const admin = createAdminClient();
  if (!admin) return "open"; // can't look it up here; the claim step still checks
  const { data } = await admin
    .from("access_links")
    .select("max_uses, use_count, expires_at, revoked_at")
    .eq("code", code)
    .maybeSingle();
  return linkState(data);
}
