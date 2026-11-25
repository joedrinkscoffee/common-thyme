import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings-shell";
import { HouseholdSettings, type HouseholdView, type MemberView } from "@/components/settings-household";
import { getViewer } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Household · Settings · Common Thyme" };

const SAMPLE: HouseholdView = {
  name: "The Sample Kitchen",
  timezone: "America/New_York",
  youOwn: true,
  sample: true,
  members: [
    { userId: "a", name: "Joe", avatarUrl: null, role: "owner", joinedAt: "2026-11-19T12:00:00Z", isYou: true },
    { userId: "b", name: "Sam", avatarUrl: null, role: "member", joinedAt: "2026-11-20T12:00:00Z", isYou: false },
  ],
  invites: [{ id: "i", expiresAt: "2026-12-08T12:00:00Z" }],
};

async function Household() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/settings/household");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "sample") return <HouseholdSettings view={SAMPLE} />;
  if (!viewer.household) redirect("/");

  const db = await createClient();
  const hid = viewer.household.id;
  const [{ data: members }, { data: invites }, { data: settings }] = await Promise.all([
    db.from("household_members").select("user_id, role, joined_at, profiles(display_name, avatar_url)").eq("household_id", hid).order("joined_at"),
    db
      .from("household_invites")
      .select("id, expires_at")
      .eq("household_id", hid)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    db.from("household_settings").select("timezone").eq("household_id", hid).maybeSingle(),
  ]);
  type Row = { user_id: string; role: "owner" | "member"; joined_at: string; profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null };
  const rows: MemberView[] = ((members ?? []) as Row[]).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      userId: m.user_id,
      name: p?.display_name || "Someone",
      avatarUrl: p?.avatar_url ?? null,
      role: m.role,
      joinedAt: m.joined_at,
      isYou: m.user_id === viewer.userId,
    };
  });
  return (
    <HouseholdSettings
      view={{
        name: viewer.household.name,
        timezone: (settings?.timezone as string | undefined) || "America/New_York",
        members: rows,
        invites: (invites ?? []).map((i) => ({ id: i.id as string, expiresAt: i.expires_at as string })),
        youOwn: rows.some((m) => m.isYou && m.role === "owner"),
        sample: false,
      }}
    />
  );
}

export default function HouseholdSettingsPage() {
  return (
    <SettingsShell tab="household">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Household />
      </Suspense>
    </SettingsShell>
  );
}
