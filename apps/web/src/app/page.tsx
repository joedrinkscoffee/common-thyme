import Link from "next/link";
import { ChefWeek } from "@/components/chef-week";
import { sampleWeek } from "@/lib/sample-week";

export default function Home() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="font-display text-2xl font-extrabold tracking-tight">
          Common <span className="text-tomato">Thyme</span>
        </div>
        <nav aria-label="Main" className="flex flex-wrap gap-2">
          <Link href="/" aria-current="page" className="rounded-full bg-ink px-3.5 py-2 font-semibold text-cream no-underline">
            Chef
          </Link>
          <span className="rounded-full px-3.5 py-2 text-muted" title="Coming in the recipes step">
            Recipes
          </span>
          <span className="rounded-full px-3.5 py-2 text-muted" title="Coming in the Chef step">
            What Chef knows
          </span>
        </nav>
      </header>
      <ChefWeek initialWeek={sampleWeek} />
    </>
  );
}
