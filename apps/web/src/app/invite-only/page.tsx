import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteCard, SignOutButton } from "@/components/invite-card";
import { getViewer } from "@/lib/household";

export const metadata: Metadata = { title: "Invite-only · Common Thyme", robots: { index: false } };

async function Body() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login");
  if (viewer.kind !== "no-access") redirect("/");
  return (
    <>
      <p className="mb-6 mt-2 leading-relaxed text-muted">
        {viewer.firstName ? `Thanks for stopping by, ${viewer.firstName}. ` : "Thanks for stopping by. "}
        Common Thyme is invite-only while we test it with a few households
        {viewer.email ? (
          <>
            , and <strong className="font-semibold text-ink">{viewer.email}</strong> isn&apos;t on the list yet.
          </>
        ) : (
          ", and this Google account isn't on the list yet."
        )}
      </p>
      <p className="mb-6 leading-relaxed text-muted">
        If someone sent you an invite link, open it and sign in again. It&apos;ll let you straight in.
      </p>
      <SignOutButton label="Use a different Google account" />
    </>
  );
}

/** Where people land when they sign in with Google but weren't invited. */
export default function InviteOnlyPage() {
  return (
    <InviteCard title="Common Thyme is invite-only.">
      <Suspense fallback={<div className="min-h-40" />}>
        <Body />
      </Suspense>
    </InviteCard>
  );
}
