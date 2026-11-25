import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { AdminHouseholds } from "@/components/admin-households";
import { getViewer } from "@/lib/household";
import { chefDailyLimit, loadAdminHouseholds } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin · Common Thyme" };

async function Content() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/admin");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "sample" || !viewer.isAdmin) redirect("/");

  const [households, limit] = await Promise.all([loadAdminHouseholds(), chefDailyLimit()]);
  // eslint-disable-next-line react-hooks/purity -- a server render, once per request
  const now = Date.now();
  return <AdminHouseholds households={households} limit={limit} myHouseholdId={viewer.household?.id ?? null} now={now} />;
}

/** Admins only: who's testing, how much they use Chef, and the daily limit. */
export default function AdminPage() {
  return (
    <AdminShell tab="testers">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Content />
      </Suspense>
    </AdminShell>
  );
}
