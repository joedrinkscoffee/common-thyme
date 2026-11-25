import { Suspense } from "react";
import Link from "next/link";
import { supabaseEnv } from "@/lib/supabase/env";
import { getViewer } from "@/lib/household";
import { MobileNav, type NavItem } from "@/components/mobile-nav";

/**
 * Part of the static header, so it is there on first paint and the nav never
 * shifts. Every page that shows this header already sends signed-out visitors
 * to /login, so only the sample week (no Supabase configured) needs to hide it.
 */
function SignOut() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="rounded-full px-3.5 py-2 text-muted hover:text-ink">
        Sign out
      </button>
    </form>
  );
}

const ON = "rounded-full bg-ink px-3.5 py-2 font-semibold text-cream no-underline";
const OFF = "rounded-full px-3.5 py-2 font-semibold text-ink no-underline transition-colors hover:bg-lemon";

type Section = "chef" | "recipes" | "groceries" | "knows" | "invites";

const PAGES: { key: Section; href: string; label: string }[] = [
  { key: "chef", href: "/", label: "Chef" },
  { key: "recipes", href: "/recipes", label: "Recipes" },
  { key: "groceries", href: "/groceries", label: "Groceries" },
  { key: "knows", href: "/what-chef-knows", label: "What Chef knows" },
];

/**
 * Only the app's owner sees this. It sits beside the logo (not in the nav), so
 * it can stream in after first paint without moving anything.
 */
async function OwnerLink({ active, variant }: { active: boolean; variant: "desktop" | "mobile" }) {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.isOwner) return null;
  if (variant === "mobile") {
    return (
      <Link
        href="/invites"
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center justify-between rounded-xl px-4 py-3 text-lg font-semibold no-underline",
          active ? "bg-ink text-cream" : "text-ink transition-colors hover:bg-lemon focus-visible:bg-lemon",
        ].join(" ")}
      >
        Invites
        {active && <span className="text-sm font-medium text-cream/70">You&rsquo;re here</span>}
      </Link>
    );
  }
  return (
    <Link
      href="/invites"
      aria-current={active ? "page" : undefined}
      className={[
        "hidden rounded-full border-2 border-ink px-3 py-1 text-sm font-bold no-underline shadow-pop-sm md:inline-block",
        active ? "bg-ink text-cream" : "bg-lemon text-ink hover:bg-caper",
      ].join(" ")}
    >
      Invites
    </Link>
  );
}

export function SiteHeader({ active = "chef" }: { active?: Section }) {
  const showSignOut = Boolean(supabaseEnv());
  const items: NavItem[] = PAGES.map((p) => ({ href: p.href, label: p.label, active: p.key === active }));

  return (
    <header className="relative mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="whitespace-nowrap font-display text-2xl font-extrabold tracking-tight text-ink no-underline">
          Common <span className="text-tomato">Thyme</span>
        </Link>
        {showSignOut && (
          <Suspense fallback={null}>
            <OwnerLink active={active === "invites"} variant="desktop" />
          </Suspense>
        )}
      </div>
      <nav aria-label="Main" className="hidden flex-wrap items-center gap-2 md:flex">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={item.active ? ON : OFF} aria-current={item.active ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
        {showSignOut && <SignOut />}
      </nav>
      <MobileNav
        items={items}
        showSignOut={showSignOut}
        extra={
          showSignOut ? (
            <Suspense fallback={null}>
              <OwnerLink active={active === "invites"} variant="mobile" />
            </Suspense>
          ) : null
        }
      />
    </header>
  );
}
