import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";

export type Viewer =
  | { kind: "sample" } // Supabase not configured yet
  | { kind: "signed-out" }
  | {
      kind: "signed-in";
      userId: string;
      firstName: string | null;
      household: { id: string; name: string; memberCount: number } | null;
    };

/** Who is looking at the page, and which household they belong to. */
export async function getViewer(): Promise<Viewer> {
  if (!supabaseEnv()) return { kind: "sample" };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { kind: "signed-out" };

  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = (meta.full_name ?? meta.name ?? null) as string | null;
  const firstName = fullName ? fullName.split(" ")[0] : null;

  // v1: one household per person.
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, households(name)")
    .eq("user_id", claims.sub)
    .order("joined_at")
    .limit(1)
    .maybeSingle();

  if (!membership) return { kind: "signed-in", userId: claims.sub, firstName, household: null };

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
    household: { id: membership.household_id, name: name ?? "Your household", memberCount: count ?? 1 },
  };
}
