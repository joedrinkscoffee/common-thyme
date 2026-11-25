import { ChefLimit } from "@/components/chef-limit";
import type { AdminHousehold } from "@/lib/admin";
import { dollars } from "@/lib/chef-cost";

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ago(iso: string | null, now: number) {
  if (!iso) return "never";
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return day(iso);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={["rounded-xl border-2 px-3 py-2", tone === "warn" ? "border-ink bg-lemon" : "border-line bg-cream"].join(" ")}>
      <div className="font-display text-xl font-extrabold leading-tight">{value}</div>
      <div className="text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

function HouseholdCard({ h, limit, mine, now }: { h: AdminHousehold; limit: number; mine: boolean; now: number }) {
  const nearLimit = h.chefToday >= limit * 0.8;
  return (
    <li className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-xl font-extrabold">{h.name}</span>
        {mine && <span className="rounded-full border-2 border-ink bg-kale px-2.5 py-0.5 text-xs font-bold">You</span>}
        {nearLimit && <span className="rounded-full border-2 border-ink bg-lemon px-2.5 py-0.5 text-xs font-bold">Near today&rsquo;s limit</span>}
      </div>
      <div className="mt-0.5 text-sm text-muted" suppressHydrationWarning>
        Started {day(h.createdAt)} · active {ago(h.lastActive, now)}
      </div>

      <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
        {h.members.map((m) => (
          <li key={m.email} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="min-w-0 break-all">
              <span className="font-semibold">{m.name ?? m.email.split("@")[0]}</span> <span className="text-muted">{m.email}</span>
            </span>
            <span className="shrink-0 text-xs text-muted" suppressHydrationWarning>
              signed in {ago(m.lastSignInAt, now)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Stat label="Chef today" value={`${h.chefToday}/${limit}`} tone={nearLimit ? "warn" : undefined} />
        <Stat label="Chef, 7 days" value={String(h.chefWeek)} />
        <Stat label="Cost, 30 days" value={dollars(h.costMonth)} />
        <Stat label="Recipes" value={String(h.recipes)} />
        <Stat label="Meals planned" value={String(h.mealsPlanned)} />
      </div>
    </li>
  );
}

/** The Testers tab: totals, the daily Chef limit, and one card per household. */
export function AdminHouseholds({ households, limit, myHouseholdId, now }: { households: AdminHousehold[]; limit: number; myHouseholdId: string | null; now: number }) {
  const people = households.reduce((n, h) => n + h.members.length, 0);
  const chefToday = households.reduce((n, h) => n + h.chefToday, 0);
  const cost = households.reduce((n, h) => n + h.costMonth, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Households" value={String(households.length)} />
        <Stat label="People" value={String(people)} />
        <Stat label="Chef messages today" value={String(chefToday)} />
        <Stat label="Chef cost, 30 days" value={dollars(cost)} />
      </div>

      <ChefLimit limit={limit} />

      <section>
        <h2 className="mb-1 mt-0 font-display text-2xl font-extrabold">Households</h2>
        <p className="mb-3 mt-0 text-sm text-muted">
          Counts and dates only. Nobody&rsquo;s recipes, meals or Chef chats show here. Cost is an estimate from Chef&rsquo;s token use; the
          Anthropic Console has the real bill.
        </p>
        {households.length === 0 ? (
          <p className="m-0 text-muted">No households yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {households.map((h) => (
              <HouseholdCard key={h.id} h={h} limit={limit} mine={h.id === myHouseholdId} now={now} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

