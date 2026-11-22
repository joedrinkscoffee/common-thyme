/**
 * Signed one-tap links for reminder emails. A link names one dinner, one
 * answer and the person it was sent to, expires after two weeks, and is
 * signed with a key derived from CRON_SECRET, so it works without signing in
 * but can't be forged or pointed at another dinner.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { CHECK_IN_ACTIONS, type CheckInAction } from "./chef/check-in";

export type LinkAction = CheckInAction | "undo";
export type CheckInClaim = { dinnerId: string; userId: string; action: LinkAction; expires: number };

const TTL_MS = 14 * 86_400_000;
const ACTIONS: LinkAction[] = [...CHECK_IN_ACTIONS, "undo"];

function key(secret: string) {
  return createHmac("sha256", secret).update("common-thyme check-in links v1").digest();
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signCheckIn(claim: Omit<CheckInClaim, "expires"> & { expires?: number }, secret: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ d: claim.dinnerId, u: claim.userId, a: claim.action, e: claim.expires ?? now + TTL_MS }));
  const sig = b64(createHmac("sha256", key(secret)).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyCheckIn(token: string, secret: string, now = Date.now()): CheckInClaim | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const want = createHmac("sha256", key(secret)).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { d?: unknown; u?: unknown; a?: unknown; e?: unknown };
    if (typeof p.d !== "string" || typeof p.u !== "string" || typeof p.e !== "number") return null;
    if (!ACTIONS.includes(p.a as LinkAction) || p.e < now) return null;
    return { dinnerId: p.d, userId: p.u, action: p.a as LinkAction, expires: p.e };
  } catch {
    return null;
  }
}
