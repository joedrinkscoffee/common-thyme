import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { GoogleSignIn } from "@/components/google-sign-in";
import { InviteCard, SignOutButton } from "@/components/invite-card";
import { getViewer } from "@/lib/household";
import { accessLinkState, cleanCode } from "@/lib/access-links";

export const metadata: Metadata = { title: "You're invited · Common Thyme", robots: { index: false } };

const PRIMARY = "flex min-h-[52px] w-full items-center justify-center rounded-full bg-tomato px-6 font-bold text-white no-underline hover:bg-tomato-dark";

async function Body({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ code: raw }, { error }] = await Promise.all([params, searchParams]);
  const code = cleanCode(raw);
  const [viewer, state] = await Promise.all([getViewer(), accessLinkState(code)]);
  const claim = `/join/${code}/claim`;

  if (viewer.kind === "signed-in" || viewer.kind === "sample") {
    return (
      <>
        <p className="mb-6 mt-2 leading-relaxed text-muted">You&apos;re already in, so you don&apos;t need this link.</p>
        <Link href="/" className={PRIMARY}>
          Open Chef
        </Link>
      </>
    );
  }

  if (state !== "open" || error) {
    return (
      <>
        <p className="mb-6 mt-2 leading-relaxed text-muted">
          {state === "expired"
            ? "This invite link has expired."
            : state === "used"
              ? "This invite link has already been used."
              : "This invite link doesn't work anymore."}{" "}
          Ask the person who sent it for a new one.
        </p>
        {viewer.kind === "no-access" && <SignOutButton />}
      </>
    );
  }

  if (viewer.kind === "no-access") {
    return (
      <>
        <p className="mb-6 mt-2 leading-relaxed text-muted">
          You&apos;re signed in as <strong className="font-semibold text-ink">{viewer.email ?? "your Google account"}</strong>. Join with this
          account and Chef will help you plan your week.
        </p>
        {/* A plain link, so it's never prefetched: following it uses the invite. */}
        <a href={claim} className={PRIMARY}>
          Join Common Thyme
        </a>
        <div className="mt-3">
          <SignOutButton label="Use a different Google account" />
        </div>
      </>
    );
  }

  return (
    <>
      <p className="mb-6 mt-2 leading-relaxed text-muted">
        Common Thyme is invite-only for now. Sign in with Google and Chef will help you plan a week of meals that share the shopping.
      </p>
      <GoogleSignIn next={claim} />
    </>
  );
}

/** An invite link: commonthyme.app/join/<code>. */
export default function JoinPage(props: PageProps<"/join/[code]">) {
  return (
    <InviteCard title="You're invited to Common Thyme.">
      <Suspense fallback={<div className="min-h-[120px]" />}>
        <Body params={props.params} searchParams={props.searchParams as Promise<{ error?: string }>} />
      </Suspense>
    </InviteCard>
  );
}
