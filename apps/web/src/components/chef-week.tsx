"use client";

import { useState, type ReactNode } from "react";
import { ChefAvatar } from "./chef-avatar";
import { RecipeTile } from "./recipe-tile";
import { sharedPerishables, type Dinner } from "@/lib/week";

const STICKERS = ["bg-lemon", "bg-caper", "bg-kale"];
const KID_CHOICES = [
  { label: "None", count: 0 },
  { label: "1", count: 1 },
  { label: "2", count: 2 },
  { label: "3", count: 3 },
  { label: "All 5", count: 5 },
];

/**
 * The Chef home: Chef's note and one question on the left, the week as square
 * tiles on the right. Uses sample data until Chef is connected.
 */
export function ChefWeek({
  initialWeek,
  firstName = null,
  statusLabel,
  partnerSlot = null,
}: {
  initialWeek: Dinner[];
  firstName?: string | null;
  statusLabel: string;
  /** Shown under Chef's note, e.g. the partner invite. */
  partnerSlot?: ReactNode;
}) {
  const [week, setWeek] = useState(initialWeek);
  const [kidsAnswer, setKidsAnswer] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const shared = sharedPerishables(week).slice(0, 3);

  function answerKids(count: number) {
    setKidsAnswer(count);
    // Placeholder rule until Chef decides: the last nights of the week.
    setWeek((w) => w.map((d, i) => ({ ...d, sharedWithKids: i >= w.length - count })));
  }

  const kidNights = week.filter((d) => d.sharedWithKids);

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-wrap items-stretch gap-8 px-4 pb-6 sm:px-6">
      <section aria-label="Conversation with Chef" className="flex min-w-0 max-w-[720px] flex-[999_1_600px] flex-col">
        <div className="mb-5 flex items-center gap-3.5">
          <ChefAvatar />
          <div>
            <div className="font-display text-[22px] font-extrabold">Chef</div>
            <div className="text-[13px] text-muted">{statusLabel}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4 text-[17px] leading-relaxed sm:text-lg">
          <p className="m-0">
            Morning{firstName ? `, ${firstName}` : ""}. Last week you cooked <strong>4 of 5</strong>. The quesadillas got bumped, so I moved them to Monday
            while the kale is still good.
          </p>
          <p className="m-0">
            Next week is built around{" "}
            {shared.map((s, i) => (
              <span key={s.name}>
                {i > 0 && (i === shared.length - 1 ? " and " : ", ")}
                <span className={`${STICKERS[i % STICKERS.length]} rounded-[5px] px-1.5 font-semibold`}>
                  {s.name.toLowerCase()} × {s.dates.length}
                </span>
              </span>
            ))}
            . Nothing fresh should be left by Friday.
          </p>
          {partnerSlot}
        </div>

        <div className="mt-6 rounded-[22px] border-2 border-ink bg-paper p-5 shadow-pop-lg">
          {kidsAnswer === null ? (
            <>
              <h2 className="m-0 font-display text-2xl font-extrabold leading-tight">
                How many dinners should the kids share this week?
              </h2>
              <p className="mt-1.5 text-muted">I&apos;ll scale those up and keep them kid-friendly.</p>
              <div role="group" aria-label="Dinners shared with the kids" className="mt-3.5 flex flex-wrap gap-2">
                {KID_CHOICES.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => answerKids(c.count)}
                    className="min-h-12 min-w-14 rounded-full border-2 border-ink bg-paper px-4 text-base font-bold hover:bg-lemon"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-lg leading-relaxed">
                {kidNights.length === 0
                  ? "Got it, just the two of you this week."
                  : `Done. ${kidNights.map((d) => d.title).join(" and ")} ${kidNights.length === 1 ? "is" : "are"} now for 4 and kid-friendly.`}{" "}
                Want me to lock in the week?
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <button type="button" className="min-h-12 rounded-full bg-tomato px-6 font-bold text-white">
                  Lock it in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKidsAnswer(null);
                    setWeek(initialWeek);
                  }}
                  className="min-h-12 rounded-full border-2 border-ink bg-paper px-5 font-semibold"
                >
                  Change my answer
                </button>
              </div>
            </>
          )}
        </div>

        <div className="min-h-6 flex-1" />

        <form
          className="flex gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setNotice("Chef isn't connected yet. That comes in a later step.");
            setDraft("");
          }}
        >
          <label htmlFor="chef-input" className="sr-only">
            Tell Chef what&apos;s going on
          </label>
          <input
            id="chef-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell Chef what's going on this week…"
            className="min-h-[60px] min-w-0 flex-1 rounded-full border-2 border-ink bg-paper px-5 text-[17px] shadow-pop"
          />
          <button
            type="submit"
            aria-label="Send"
            className="flex min-h-[60px] w-[60px] items-center justify-center rounded-full bg-tomato text-white"
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h11M11 5l5 5-5 5" />
            </svg>
          </button>
        </form>
        <p role="status" className="mt-2 min-h-5 text-sm text-muted">
          {notice}
        </p>
      </section>

      <aside aria-label="Next week" className="min-w-[280px] flex-[1_1_360px]">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="m-0 text-[13px] font-bold tracking-[0.08em] text-muted">NEXT WEEK · DRAFT</h2>
          <span className="text-[13px] text-muted">Nov 23 – 27</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {week.map((d) => (
            <RecipeTile key={d.date} dinner={d} />
          ))}
          <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-dash p-2.5 text-center text-[13px] text-muted">
            Weekend&apos;s off
          </div>
        </div>
        <p className="mt-3.5 text-[13px] text-muted">Tap a dinner to see it, or just tell Chef what to change.</p>
      </aside>
    </main>
  );
}
