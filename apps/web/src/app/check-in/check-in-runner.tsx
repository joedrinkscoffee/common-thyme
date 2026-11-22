"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { answerFromLink, type LinkOutcome } from "./actions";

const button =
  "min-h-11 rounded-full border-2 border-ink bg-paper px-5 font-bold transition-colors hover:bg-lemon disabled:cursor-wait disabled:opacity-60";

/**
 * Runs the email link's answer once the page opens in a browser. It runs from
 * the page, not on load of the link itself, so mail scanners that only fetch
 * links don't mark dinners by accident.
 */
export function CheckInRunner({ token, label }: { token: string; label: string }) {
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [busy, start] = useTransition();
  const started = useRef(false);

  const run = (t: string) =>
    start(async () => {
      setOutcome(await answerFromLink(t));
    });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run(token);
  }, [token]);

  if (!outcome) {
    return (
      <p className="m-0 text-lg" aria-live="polite">
        Saving “{label}”…
      </p>
    );
  }
  return (
    <div aria-live="polite" className="flex flex-col gap-4">
      <p className={`m-0 font-display text-2xl font-extrabold leading-tight ${outcome.ok ? "" : "text-tomato-dark"}`}>
        {outcome.ok ? outcome.text : outcome.error}
      </p>
      <div className="flex flex-wrap gap-2">
        {outcome.ok && outcome.undoToken && (
          <button type="button" disabled={busy} onClick={() => run(outcome.undoToken!)} className={button}>
            Undo
          </button>
        )}
        <Link href="/" className={`${button} inline-flex items-center bg-tomato text-white no-underline hover:bg-tomato-dark hover:text-white`}>
          Open Chef
        </Link>
      </div>
    </div>
  );
}
