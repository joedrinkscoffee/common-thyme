"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
const KIDS_PROMPT = "How many dinners should the kids share?";
const SUGGESTIONS = [KIDS_PROMPT, "Reshuffle the recipes", "Fewer dinners this week"];
const NOT_CONNECTED = "I'm not hooked up yet, so I can't act on that. Once I am, I'll change the week right here.";

type Turn =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "chef"; text: string }
  | { id: number; from: "chef"; kind: "kids-question" }
  | { id: number; from: "chef"; kind: "kids-done"; count: number };
type NewTurn = Turn extends infer T ? (T extends unknown ? Omit<T, "id"> : never) : never;

/**
 * The Chef home: one chat panel on the left (Chef's note, its questions,
 * suggested prompts and a free-text box), the week as square tiles on the
 * right. Uses sample data until Chef is connected.
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
  const [turns, setTurns] = useState<Turn[]>([{ id: 0, from: "chef", kind: "kids-question" }]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const logEnd = useRef<HTMLDivElement>(null);
  const shared = sharedPerishables(week).slice(0, 3);
  const kidNights = week.filter((d) => d.sharedWithKids);
  const openQuestion = turns.at(-1) && "kind" in turns.at(-1)! && (turns.at(-1) as { kind: string }).kind === "kids-question";

  useEffect(() => {
    if (turns.length > 1) logEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns.length]);

  function add(...items: NewTurn[]) {
    setTurns((t) => [...t, ...items.map((item) => ({ ...item, id: nextId.current++ }) as Turn)]);
  }

  function answerKids(choice: (typeof KID_CHOICES)[number]) {
    // Placeholder rule until Chef decides: the last nights of the week.
    setWeek((w) => w.map((d, i) => ({ ...d, sharedWithKids: i >= w.length - choice.count })));
    add({ from: "user", text: choice.label }, { from: "chef", kind: "kids-done", count: choice.count });
  }

  function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    if (clean === KIDS_PROMPT) {
      add({ from: "user", text: clean }, { from: "chef", kind: "kids-question" });
      return;
    }
    add({ from: "user", text: clean }, { from: "chef", text: NOT_CONNECTED });
  }

  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-wrap items-start gap-8 px-4 pb-6 sm:px-6">
      <section
        aria-label="Chat with Chef"
        className="flex min-w-0 max-w-[720px] flex-[999_1_600px] flex-col overflow-hidden rounded-[28px] border-2 border-ink bg-paper lg:min-h-[640px]"
      >
        <header className="flex items-center gap-3 border-b-2 border-line px-5 py-4 sm:px-6">
          <ChefAvatar size={44} />
          <div>
            <div className="font-display text-xl font-extrabold leading-tight">Chef</div>
            <div className="text-[13px] text-muted">{statusLabel}</div>
          </div>
        </header>

        <div role="log" aria-live="polite" className="flex flex-1 flex-col gap-4 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3.5 text-[17px] leading-relaxed">
            <p className="m-0">
              Morning{firstName ? `, ${firstName}` : ""}. Last week you cooked <strong>4 of 5</strong>. The quesadillas got
              bumped, so I moved them to Monday while the kale is still good.
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

          {turns.map((turn, i) => {
            const isLast = i === turns.length - 1;
            if (turn.from === "user") {
              return (
                <p key={turn.id} className="m-0 max-w-[85%] self-end rounded-[18px] rounded-br-[4px] bg-ink px-4 py-2.5 text-cream">
                  {turn.text}
                </p>
              );
            }
            if (!("kind" in turn)) {
              return (
                <p key={turn.id} className="m-0 max-w-[88%] self-start rounded-[18px] rounded-bl-[4px] bg-sand px-4 py-2.5 leading-relaxed">
                  {turn.text}
                </p>
              );
            }
            if (turn.kind === "kids-question") {
              return (
                <div key={turn.id} className="max-w-[92%] self-start rounded-[18px] rounded-bl-[4px] bg-sand px-4 py-3.5">
                  <p className="m-0 font-display text-xl font-extrabold leading-tight">{KIDS_PROMPT.replace("?", " this week?")}</p>
                  <p className="mb-0 mt-1 text-[15px] text-muted">I&apos;ll scale those up and keep them kid-friendly.</p>
                  {isLast && (
                    <div role="group" aria-label="Dinners shared with the kids" className="mt-3 flex flex-wrap gap-2">
                      {KID_CHOICES.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          onClick={() => answerKids(c)}
                          className="min-h-11 min-w-12 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={turn.id} className="max-w-[92%] self-start rounded-[18px] rounded-bl-[4px] bg-sand px-4 py-3.5 leading-relaxed">
                <p className="m-0">
                  {turn.count === 0
                    ? "Got it, just the two of you this week."
                    : `Done. ${kidNights.map((d) => d.title).join(" and ")} ${kidNights.length === 1 ? "is" : "are"} now for 4 and kid-friendly.`}{" "}
                  Want me to lock in the week?
                </p>
                {isLast && (
                  <button type="button" className="mt-3 min-h-11 rounded-full bg-tomato px-5 font-bold text-white">
                    Lock it in
                  </button>
                )}
              </div>
            );
          })}
          <div ref={logEnd} />
        </div>

        <footer className="border-t-2 border-line bg-cream/60 px-4 pb-4 pt-3 sm:px-5">
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggestions">
            {SUGGESTIONS.filter((s) => !(s === KIDS_PROMPT && openQuestion)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="min-h-9 rounded-full border-2 border-ink bg-paper px-3.5 text-sm font-semibold transition-colors hover:bg-lemon"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
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
              className="min-h-[52px] min-w-0 flex-1 rounded-full border-2 border-ink bg-paper px-5 text-base"
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex min-h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-tomato text-white"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 10h11M11 5l5 5-5 5" />
              </svg>
            </button>
          </form>
        </footer>
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
