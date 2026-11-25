import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings-shell";
import { PlanningSettings, type Preference } from "@/components/settings-planning";
import { CalendarLink, type CalendarNightView } from "@/components/calendar-link";
import { getViewer } from "@/lib/household";
import { calendarLink, chefContext, loadCalendarNights } from "@/lib/chef/server";
import { DEFAULT_SETTINGS } from "@/lib/chef/store";
import { dayName, shortDate } from "@/lib/chef/dates";
import type { CalendarNight } from "@/lib/chef/calendar";
import type { PlanningInput } from "@/app/settings/actions";

export const metadata: Metadata = { title: "Planning · Settings · Common Thyme" };

const nightView = (n: CalendarNight): CalendarNightView => ({ ...n, label: `${dayName(n.date, "short")}, ${shortDate(n.date)}` });

async function Planning() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/settings/planning");
  if (viewer.kind === "no-access") redirect("/invite-only");

  let planning: PlanningInput;
  let preferences: Preference[];
  let calendar = { linked: false, error: null as string | null, nights: [] as CalendarNight[] };
  const sample = viewer.kind === "sample";

  if (viewer.kind === "sample") {
    const s = DEFAULT_SETTINGS;
    planning = { mealsPerWeek: s.dinnersPerWeek, baseServings: s.baseServings, kidsExtraServings: s.kidsExtraServings, noRepeatWeeks: s.noRepeatWeeks, timezone: s.timezone };
    preferences = [
      { id: "1", body: "No mushrooms for Sam." },
      { id: "2", body: "Mostly vegetarian on weeknights." },
    ];
  } else {
    if (!viewer.household) redirect("/");
    const { store, db, settings, today } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
    const [notes, nights] = await Promise.all([store.notes(), loadCalendarNights(db, viewer.household.id, settings.timezone, today)]);
    const link = nights === null ? null : await calendarLink(db, viewer.household.id);
    calendar = { linked: !!link, error: link?.lastError ?? null, nights: (nights ?? []).slice(0, 6) };
    planning = {
      mealsPerWeek: settings.dinnersPerWeek,
      baseServings: settings.baseServings,
      kidsExtraServings: settings.kidsExtraServings,
      noRepeatWeeks: settings.noRepeatWeeks,
      timezone: settings.timezone,
    };
    preferences = notes.filter((n) => n.source === "you_said" && n.category === "tastes").map((n) => ({ id: n.id, body: n.body }));
  }

  return (
    <>
      <PlanningSettings planning={planning} preferences={preferences} sample={sample} />
      <CalendarLink linked={calendar.linked} error={calendar.error} nights={calendar.nights.map(nightView)} sample={sample} />
      <p className="m-0 text-[15px] text-muted">
        Everything else Chef has picked up, like habits and who&apos;s in the house, is on{" "}
        <Link href="/what-chef-knows" className="font-semibold text-tomato-dark">
          What Chef knows
        </Link>
        .
      </p>
    </>
  );
}

export default function PlanningSettingsPage() {
  return (
    <SettingsShell tab="planning">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Planning />
      </Suspense>
    </SettingsShell>
  );
}
