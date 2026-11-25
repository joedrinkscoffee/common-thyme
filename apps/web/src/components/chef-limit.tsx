"use client";

import { useState, useTransition } from "react";
import { setChefDailyLimit } from "@/app/admin/actions";

/** The daily Chef message limit, editable in place. */
export function ChefLimit({ limit }: { limit: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(limit));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await setChefDailyLimit(Number(value));
      if (result.ok) {
        setValue(String(result.limit));
        setEditing(false);
      } else setError(result.error);
    });
  }

  return (
    <section className="rounded-[22px] border-2 border-ink bg-paper p-5 shadow-pop-lg sm:p-6">
      <h2 className="m-0 font-display text-2xl font-extrabold">Daily Chef limit</h2>
      <p className="mb-0 mt-1 text-sm leading-relaxed text-muted">
        The most messages one household can send Chef in 24 hours. It keeps one busy tester from running up your Anthropic bill.
      </p>
      {editing ? (
        <form onSubmit={save} className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="sr-only">Messages per household per day</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="min-h-[48px] w-28 rounded-xl border-2 border-ink bg-paper px-4 text-lg font-bold"
            />
            <span className="font-semibold">a day</span>
          </label>
          <button type="submit" disabled={pending} className="min-h-[48px] rounded-full bg-tomato px-5 font-bold text-white hover:bg-tomato-dark disabled:opacity-60">
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setValue(String(limit));
              setError(null);
            }}
            className="min-h-[48px] rounded-full px-4 font-semibold text-muted hover:bg-lemon hover:text-ink"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-extrabold">{value}</span>
          <span className="font-semibold">messages a day</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto min-h-[44px] rounded-full border-2 border-ink bg-paper px-4 text-sm font-bold transition-colors hover:bg-lemon"
          >
            Change
          </button>
        </div>
      )}
      {error && (
        <p role="status" className="mb-0 mt-2 text-sm text-tomato-dark">
          {error}
        </p>
      )}
    </section>
  );
}
