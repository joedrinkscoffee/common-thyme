import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";

export type Viewer =
  | { kind: "sample" } // Supabase not configured yet
  | { kind: "signed-out" }
  // Signed in with Google, but not invited: sees the invite-only page.
  | { kind: "no-access"; userId: string; firstName: string | null; email: string | null }
  | {
      kind: "signed-in";
      userId: string;
      firstName: string | null;
      /** Flagged as an admin in the database: sees the Admin page. */
      isAdmin: boolean;
      household: { id: string; name: string; memberCount: number } | null;
    };

/**
 * Who is looking at the page, whether they're invited, and which household
 * they belong to. Cached for the request, so the header and page share it.
 */
export const getViewer = cache(async function getViewer(): Promise<Viewer> {
  if (!supabaseEnv()) return { kind: "sample" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { kind: "signed-out" };

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = (meta.full_name ?? meta.name ?? null) as string | null;
  const firstName = fullName ? fullName.split(" ")[0] : null;

  // v1: one household per person.
  const [{ data: access }, { data: membership }] = await Promise.all([
    supabase.rpc("my_app_access"),
    supabase
      .from("household_members")
      .select("household_id, households(name)")
      .eq("user_id", claims.sub)
      .order("joined_at")
      .limit(1)
      .maybeSingle(),
  ]);

  // The database enforces this too; this only picks the page to show.
  if (access !== "admin" && access !== "allowed") {
    return { kind: "no-access", userId: claims.sub, firstName, email: typeof claims.email === "string" ? claims.email : null };
  }
  const isAdmin = access === "admin";
  if (!membership) return { kind: "signed-in", userId: claims.sub, firstName, isAdmin, household: null };

  const { count } = await supabase
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", membership.household_id);

  const households = membership.households as { name: string } | { name: string }[] | null;
  const name = Array.isArray(households) ? households[0]?.name : households?.name;

  return {
    kind: "signed-in",
    userId: claims.sub,
    firstName,
    isAdmin,
    household: { id: membership.household_id, name: name ?? "Your household", memberCount: count ?? 1 },
  };
});
