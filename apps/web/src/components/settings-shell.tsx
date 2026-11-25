import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

const TABS = [
  { key: "account", href: "/settings", label: "Account" },
  { key: "household", href: "/settings/household", label: "Household" },
  { key: "tags", href: "/settings/tags", label: "Tags" },
] as const;

export type SettingsTab = (typeof TABS)[number]["key"];

/** The Settings frame: header, title and the tab row (three equal tabs on a phone). */
export function SettingsShell({ tab, children }: { tab: SettingsTab; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="settings" />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-32 sm:px-6">
        <h1 className="mb-4 mt-2 font-display text-4xl font-extrabold tracking-tight">Settings</h1>
        <nav aria-label="Settings" className="mb-6">
          <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0 sm:flex sm:gap-2">
            {TABS.map((t) => (
              <li key={t.key}>
                <Link
                  href={t.href}
                  aria-current={t.key === tab ? "page" : undefined}
                  className={[
                    "flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full border-2 px-1 text-sm font-semibold no-underline transition-colors min-[400px]:text-base sm:px-4",
                    t.key === tab ? "border-ink bg-ink text-cream" : "border-dash bg-paper text-ink hover:border-ink hover:bg-lemon",
                  ].join(" ")}
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-5">{children}</div>
      </main>
    </>
  );
}
