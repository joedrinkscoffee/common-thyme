import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/household";
import { calendarLink, chefContext, loadCalendarNights } from "@/lib/chef/server";
import Link from "next/link";
import type { CalendarNightView } from "@/components/calendar-link";
import { dayName, shortDate } from "@/lib/chef/dates";
import type { CalendarNight } from "@/lib/chef/calendar";
import type { ChefNote } from "@/lib/chef/store";
import { forgetNote } from "./actions";

const SAMPLE: ChefNote[] = [
  { id: "1", source: "you_said", category: "tastes", body: "No mushrooms for Joe's partner." },
  { id: "2", source: "you_said", category: "habits", body: "Friday is usually pizza night." },
  { id: "3", source: "learned", category: "habits", body: "Fish dinners get skipped more than others." },
];

function NoteList({ title, hint, notes, sample }: { title: string; hint: string; notes: ChefNote[]; sample: boolean }) {
  return (
    <section className="rounded-[24px] border-2 border-ink bg-paper p-5 sm:p-6">
      <h2 className="m-0 font-display text-xl font-extrabold">{title}</h2>
      <p className="mb-4 mt-1 text-[15px] text-muted">{hint}</p>
      {notes.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-2.5">
              <span>
                <span className="mr-2 rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">{n.category}</span>
                {n.body}
              </span>
              {!sample && (
                <form action={forgetNote.bind(null, n.id)}>
                  <button type="submit" className="rounded-full px-3 py-1 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink">
                    Forget
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted">Nothing yet.</p>
      )}
    </section>
  );
}

/** What Chef sees on the calendar. Linking and unlinking it lives in Settings. */
function CalendarSummary({ linked, error, nights }: { linked: boolean; error: string | null; nights: CalendarNightView[] }) {
  const settings = (
    <Link href="/settings/planning" className="font-semibold text-tomato-dark">
      {linked ? "Change it in Settings" : "Link one in Settings"}
    </Link>
  );
  return (
    <section className="rounded-[24px] border-2 border-ink bg-paper p-5 sm:p-6">
      <h2 className="m-0 font-display text-xl font-extrabold">Your calendar</h2>
      {!linked ? (
        <p className="mb-0 mt-1 text-[15px] text-muted">No calendar linked, so Chef doesn&apos;t know about busy evenings or trips. {settings}.</p>
      ) : error ? (
        <p className="mb-0 mt-1 text-[15px] text-tomato-dark">Last time Chef couldn&apos;t read it: {error}. {settings}.</p>
      ) : (
        <>
          <p className="mb-3 mt-1 text-[15px] text-muted">Busy evenings get a quick dinner and travel nights stay open. {settings}.</p>
          {nights.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {nights.map((n) => (
                <li key={n.date} className="flex flex-wrap items-center gap-2 rounded-2xl bg-sand px-4 py-2.5">
                  <span className="rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">{n.kind === "away" ? "away" : "quick dinner"}</span>
                  <span className="font-semibold">{n.label}</span>
                  <span className="text-muted">{n.titles.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-muted">Nothing in the next few weeks changes dinner.</p>
          )}
        </>
      )}
    </section>
  );
}

const SAMPLE_NIGHTS: CalendarNight[] = [
  { date: "2026-11-24", kind: "busy", titles: ["Soccer practice at 5:30 PM"] },
  { date: "2026-12-02", kind: "away", titles: ["Flight to Denver"] },
];

const nightView = (n: CalendarNight): CalendarNightView => ({ ...n, label: `${dayName(n.date, "short")}, ${shortDate(n.date)}` });

async function Notes({ sampleCalendar }: { sampleCalendar: boolean }) {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login");
  if (viewer.kind === "no-access") redirect("/invite-only");
  let notes = SAMPLE;
  const sample = viewer.kind === "sample";
  let calendar = { linked: sampleCalendar, error: null as string | null, nights: sampleCalendar ? SAMPLE_NIGHTS : [] };
  if (viewer.kind === "signed-in") {
    if (!viewer.household) redirect("/");
    const { store, db, settings, today } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
    const [n, nights] = await Promise.all([store.notes(), loadCalendarNights(db, viewer.household.id, settings.timezone, today)]);
    notes = n;
    const link = nights === null ? null : await calendarLink(db, viewer.household.id);
    calendar = { linked: !!link, error: link?.lastError ?? null, nights: (nights ?? []).slice(0, 8) };
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <CalendarSummary linked={calendar.linked} error={calendar.error} nights={calendar.nights.map(nightView)} />
      </div>
      <NoteList title="You said" hint="Things you told Chef. Tell Chef in the chat to add more." notes={notes.filter((n) => n.source === "you_said")} sample={sample} />
      <NoteList title="Chef noticed" hint="Patterns Chef picked up from how your weeks went." notes={notes.filter((n) => n.source === "learned")} sample={sample} />
    </div>
  );
}

export default function WhatChefKnows({ searchParams }: PageProps<"/what-chef-knows">) {
  return (
    <>
      <SiteHeader active="knows" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 sm:px-6">
        <h1 className="mb-1 mt-2 font-display text-4xl font-extrabold tracking-tight">What Chef knows</h1>
        <p className="mb-6 mt-0 text-muted">Chef uses these when it plans your week. Forget anything that&apos;s no longer true.</p>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <NotesFor searchParams={searchParams as Promise<{ calendar?: string }>} />
        </Suspense>
      </main>
    </>
  );
}

async function NotesFor({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  const { calendar } = await searchParams;
  return <Notes sampleCalendar={calendar === "sample"} />;
}
