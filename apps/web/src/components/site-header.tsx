import Link from "next/link";
import { Suspense } from "react";
import { getViewer } from "@/lib/household";

async function SignOut() {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in") return null;
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="rounded-full px-3.5 py-2 text-muted hover:text-ink">
        Sign out
      </button>
    </form>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="font-display text-2xl font-extrabold tracking-tight">
        Common <span className="text-tomato">Thyme</span>
      </div>
      <nav aria-label="Main" className="flex flex-wrap items-center gap-2">
        <Link href="/" className="rounded-full bg-ink px-3.5 py-2 font-semibold text-cream no-underline">
          Chef
        </Link>
        <span className="rounded-full px-3.5 py-2 text-muted" title="Coming in the recipes step">
          Recipes
        </span>
        <span className="rounded-full px-3.5 py-2 text-muted" title="Coming in the Chef step">
          What Chef knows
        </span>
        <Suspense fallback={null}>
          <SignOut />
        </Suspense>
      </nav>
    </header>
  );
}
