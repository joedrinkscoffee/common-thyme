import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings-shell";
import { AccountSettings, type AccountView } from "@/components/settings-account";
import { getViewer } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings · Common Thyme" };

const SAMPLE: AccountView = {
  name: "Joe Sample",
  email: "joe@example.com",
  avatarUrl: null,
  timezone: "America/New_York",
  thursday: true,
  sunday: true,
  isAdmin: false,
  household: { name: "The Sample Kitchen", recipeCount: 64, others: ["Sam"] },
  sample: true,
};

async function Account() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/settings");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "sample") return <AccountSettings view={SAMPLE} />;

  const db = await createClient();
  const hid = viewer.household?.id;
  const [{ data: claims }, { data: profile }, members, recipes] = await Promise.all([
    db.auth.getClaims(),
    db.from("profiles").select("display_name, avatar_url, timezone, checkin_thursday, checkin_sunday").eq("id", viewer.userId).maybeSingle(),
    hid ? db.from("household_members").select("user_id, profiles(display_name)").eq("household_id", hid) : Promise.resolve({ data: [] }),
    hid ? db.from("recipes").select("id", { count: "exact", head: true }).eq("household_id", hid) : Promise.resolve({ count: 0 }),
  ]);
  type MemberRow = { user_id: string; profiles: { display_name: string | null } | { display_name: string | null }[] | null };
  const others = ((members.data ?? []) as MemberRow[])
    .filter((m) => m.user_id !== viewer.userId)
    .map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return p?.display_name?.split(" ")[0] || "your partner";
    });
  const email = claims?.claims?.email;
  const view: AccountView = {
    name: profile?.display_name || viewer.firstName || "You",
    email: typeof email === "string" ? email : null,
    avatarUrl: profile?.avatar_url ?? null,
    timezone: profile?.timezone ?? null,
    thursday: profile?.checkin_thursday ?? true,
    sunday: profile?.checkin_sunday ?? true,
    isAdmin: viewer.isAdmin,
    household: viewer.household ? { name: viewer.household.name, recipeCount: recipes.count ?? 0, others } : null,
    sample: false,
  };
  return <AccountSettings view={view} />;
}

export default function SettingsPage() {
  return (
    <SettingsShell tab="account">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Account />
      </Suspense>
    </SettingsShell>
  );
}
