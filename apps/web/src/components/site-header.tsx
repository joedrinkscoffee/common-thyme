import { Suspense } from "react";
import Link from "next/link";
import { supabaseEnv } from "@/lib/supabase/env";
import { getViewer } from "@/lib/household";
import { MobileNav, type NavItem } from "@/components/mobile-nav";

const ON = "rounded-full bg-ink px-3.5 py-2 font-semibold text-cream no-underline";
const OFF = "rounded-full px-3.5 py-2 font-semibold text-ink no-underline transition-colors hover:bg-lemon";

type Section = "chef" | "recipes" | "groceries" | "knows" | "settings" | "admin";

const PAGES: { key: Section; href: string; label: string }[] = [
  { key: "chef", href: "/", label: "Chef" },
  { key: "recipes", href: "/recipes", label: "Recipes" },
  { key: "groceries", href: "/groceries", label: "Groceries" },
  { key: "knows", href: "/what-chef-knows", label: "What Chef knows" },
  { key: "settings", href: "/settings", label: "Settings" },
];

/**
 * Only admins see this (the database decides who is one). It sits beside the logo (not in the nav), so
 * it can stream in after first paint without moving anything.
 */
async function AdminLink({ active, variant }: { active: boolean; variant: "desktop" | "mobile" }) {
  const viewer = await getViewer();
  if (viewer.kind !== "signed-in" || !viewer.isAdmin) return null;
  if (variant === "mobile") {
    return (
      <Link
        href="/admin"
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center justify-between rounded-xl px-4 py-3 text-lg font-semibold no-underline",
          active ? "bg-ink text-cream" : "text-ink transition-colors hover:bg-lemon focus-visible:bg-lemon",
        ].join(" ")}
      >
        Admin
        {active && <span className="text-sm font-medium text-cream/70">You&rsquo;re here</span>}
      </Link>
    );
  }
  return (
    <Link
      href="/admin"
      aria-current={active ? "page" : undefined}
      className={[
        "hidden rounded-full border-2 border-ink px-3 py-1 text-sm font-bold no-underline shadow-pop-sm md:inline-block",
        active ? "bg-ink text-cream" : "bg-lemon text-ink hover:bg-caper",
      ].join(" ")}
    >
      Admin
    </Link>
  );
}

export function SiteHeader({ active = "chef" }: { active?: Section }) {
  // The sample week (no Supabase configured) has no admin to look up.
  const live = Boolean(supabaseEnv());
  const items: NavItem[] = PAGES.map((p) => ({ href: p.href, label: p.label, active: p.key === active }));

  return (
    <header className="relative mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="whitespace-nowrap font-display text-2xl font-extrabold tracking-tight text-ink no-underline">
          Common <span className="text-tomato">Thyme</span>
        </Link>
        {live && (
          <Suspense fallback={null}>
            <AdminLink active={active === "admin"} variant="desktop" />
          </Suspense>
        )}
      </div>
      <nav aria-label="Main" className="hidden flex-wrap items-center gap-2 md:flex">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={item.active ? ON : OFF} aria-current={item.active ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      <MobileNav
        items={items}
        extra={
          live ? (
            <Suspense fallback={null}>
              <AdminLink active={active === "admin"} variant="mobile" />
            </Suspense>
          ) : null
        }
      />
    </header>
  );
}
