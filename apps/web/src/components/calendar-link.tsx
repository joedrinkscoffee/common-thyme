"use client";

import { useActionState } from "react";
import { removeCalendar, saveCalendar } from "@/app/what-chef-knows/actions";

export type CalendarNightView = { date: string; label: string; kind: "away" | "busy"; titles: string[] };

/** The "Your calendar" card: paste a private iCal link, or see what Chef found. */
export function CalendarLink({
  linked,
  error,
  nights,
  sample = false,
}: {
  linked: boolean;
  error: string | null;
  nights: CalendarNightView[];
  sample?: boolean;
}) {
  const [state, action, pending] = useActionState(saveCalendar, null);
  return (
    <section className="rounded-[24px] border-2 border-ink bg-paper p-5 sm:p-6">
      <h2 className="m-0 font-display text-xl font-extrabold">Your calendar</h2>
      {linked ? (
        <>
          <p className="mb-4 mt-1 text-[15px] text-muted">
            Chef checks it when it plans. Evenings with something on from 4:30 to 7:30 PM get a dinner of 30 minutes or less, and travel nights are left open.
          </p>
          {error ? (
            <p className="m-0 mb-3 rounded-2xl bg-sand px-4 py-2.5 text-tomato-dark">Last time Chef couldn&apos;t read it: {error}</p>
          ) : nights.length ? (
            <ul className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
              {nights.map((n) => (
                <li key={n.date} className="flex flex-wrap items-center gap-2 rounded-2xl bg-sand px-4 py-2.5">
                  <span className="rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">{n.kind === "away" ? "away" : "quick dinner"}</span>
                  <span className="font-semibold">{n.label}</span>
                  <span className="text-muted">{n.titles.join(", ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mb-3 text-muted">Nothing in the next few weeks changes dinner.</p>
          )}
          {!sample && (
            <form action={removeCalendar}>
              <button type="submit" className="rounded-full px-3 py-1 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink">
                Unlink calendar
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 mt-1 text-[15px] text-muted">
            Link a calendar and Chef will plan quick dinners on busy evenings and skip nights you&apos;re away. In Google Calendar, open Settings, pick the calendar, and
            copy <strong className="text-ink">Secret address in iCal format</strong> under Integrate calendar. iCloud and Outlook links work too. Anyone with the link can see that
            calendar, so it&apos;s only shown to your household.
          </p>
          <form action={action} className="flex flex-wrap gap-2.5">
            <label htmlFor="calendar-url" className="sr-only">
              Private calendar link
            </label>
            <input
              id="calendar-url"
              name="url"
              type="url"
              required
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              className="min-h-12 min-w-0 flex-[1_1_280px] rounded-full border-2 border-ink bg-cream px-4"
            />
            <button type="submit" disabled={pending || sample} className="min-h-12 rounded-full bg-tomato px-6 font-bold text-white disabled:opacity-60">
              {pending ? "Checking…" : "Link calendar"}
            </button>
          </form>
          <p role="status" className={`mt-2 min-h-5 text-sm ${state?.ok ? "text-ink" : "text-tomato-dark"}`}>
            {state?.message}
          </p>
        </>
      )}
    </section>
  );
}
