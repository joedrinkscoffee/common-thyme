import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const TABS = [
  { key: "testers", href: "/admin", label: "Testers" },
  { key: "invites", href: "/admin/invites", label: "Invites" },
] as const;

/** The Admin page's frame: header, title and its two tabs. */
export function AdminShell({ tab, children }: { tab: (typeof TABS)[number]["key"]; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="admin" />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-10 sm:px-6">
        <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
          <h1 className="m-0 font-display text-4xl font-extrabold tracking-tight">Admin</h1>
          <span className="rounded-full border-2 border-ink bg-lemon px-2.5 py-0.5 text-xs font-bold shadow-pop-sm">Only you see this</span>
        </div>
        <nav aria-label="Admin" className="mb-6 flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={t.key === tab ? "page" : undefined}
              className={[
                "flex min-h-[44px] items-center rounded-full border-2 px-5 font-semibold no-underline transition-colors",
                t.key === tab ? "border-ink bg-ink text-cream" : "border-dash bg-paper text-ink hover:border-ink hover:bg-lemon",
              ].join(" ")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {children}
      </main>
    </>
  );
}
