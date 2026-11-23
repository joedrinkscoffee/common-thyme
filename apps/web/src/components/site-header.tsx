import Link from "next/link";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Part of the static header, so it is there on first paint and the nav never
 * shifts. Every page that shows this header already sends signed-out visitors
 * to /login, so only the sample week (no Supabase configured) needs to hide it.
 */
function SignOut() {
  if (!supabaseEnv()) return null;
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

export function SiteHeader({ active = "chef" }: { active?: "chef" | "recipes" | "groceries" | "knows" }) {
  return (
    <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <Link href="/" className="font-display text-2xl font-extrabold tracking-tight text-ink no-underline">
        Common <span className="text-tomato">Thyme</span>
      </Link>
      <nav aria-label="Main" className="flex flex-wrap items-center gap-2">
        <Link href="/" className={active === "chef" ? ON : OFF} aria-current={active === "chef" ? "page" : undefined}>
          Chef
        </Link>
        <Link href="/recipes" className={active === "recipes" ? ON : OFF} aria-current={active === "recipes" ? "page" : undefined}>
          Recipes
        </Link>
        <Link href="/groceries" className={active === "groceries" ? ON : OFF} aria-current={active === "groceries" ? "page" : undefined}>
          Groceries
        </Link>
        <Link href="/what-chef-knows" className={active === "knows" ? ON : OFF} aria-current={active === "knows" ? "page" : undefined}>
          What Chef knows
        </Link>
        <SignOut />
      </nav>
    </header>
  );
}
