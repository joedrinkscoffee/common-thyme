import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { InviteLinks, type AccessRow, type LinkRow } from "@/components/invite-links";
import { getViewer } from "@/lib/household";
import { linkState } from "@/lib/access-links";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request-origin";

export const metadata: Metadata = { title: "Invites · Admin · Common Thyme" };

async function Content() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/admin/invites");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "sample" || !viewer.isAdmin) redirect("/");

  const supabase = await createClient();
  const [{ data: links }, { data: people }, { data: me }, origin] = await Promise.all([
    supabase.from("access_links").select("id, code, label, max_uses, use_count, expires_at, revoked_at, created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("app_access").select("email, via, link_id, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("my_email"),
    requestOrigin(),
  ]);
  const labelOf = new Map((links ?? []).map((l) => [l.id as string, l.label as string | null]));

  const linkRows: LinkRow[] = (links ?? []).map((l) => ({
    id: l.id,
    url: `${origin}/join/${l.code}`,
    label: l.label,
    maxUses: l.max_uses,
    useCount: l.use_count,
    expiresAt: l.expires_at,
    state: linkState(l),
  }));
  const accessRows: AccessRow[] = (people ?? []).map((p) => ({
    email: p.email,
    via: p.via === "link" ? (labelOf.get(p.link_id ?? "") ? `Invite link · ${labelOf.get(p.link_id ?? "")}` : "Invite link") : p.via === "household" ? "Joined a partner" : "Here from the start",
    at: p.created_at,
    isYou: p.email === me,
  }));
  return <InviteLinks links={linkRows} people={accessRows} />;
}

/** Admins only: invite links and who's in. */
export default function InvitesPage() {
  return (
    <AdminShell tab="invites">
      <p className="mb-6 mt-0 max-w-prose leading-relaxed text-muted">
        Common Thyme is invite-only. Anyone who signs in through one of these links gets in with their Google account. Partners invited
        from Chef get in too.
      </p>
      <Suspense fallback={<p className="text-muted">Loading invites…</p>}>
        <Content />
      </Suspense>
    </AdminShell>
  );
}
