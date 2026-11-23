"use client";

import { useId, useState, useTransition } from "react";
import { mergeTags } from "@/app/recipes/tags/actions";
import type { TagCount } from "@/lib/tags";

/**
 * Every tag with its recipe count. Tick one to rename it, or several to merge
 * them; a bar at the bottom names the result and saves it everywhere.
 */
export function TagManager({ tags }: { tags: TagCount[] }) {
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [typed, setTyped] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(tag: string) {
    const next = picked.includes(tag) ? picked.filter((t) => t !== tag) : [...picked, tag];
    setPicked(next);
    setNote(null);
    // Suggest the most used tag picked, until someone types their own name.
    if (!typed || !next.length) {
      setName(tags.find((t) => next.includes(t.tag))?.tag ?? "");
      if (!next.length) setTyped(false);
    }
  }

  function save() {
    const from = picked;
    startTransition(async () => {
      const result = await mergeTags(from, name);
      if (!result.ok) {
        setNote({ ok: false, text: result.error });
        return;
      }
      setPicked([]);
      setName("");
      setTyped(false);
      const recipes = `${result.updated} ${result.updated === 1 ? "recipe" : "recipes"}`;
      setNote({
        ok: true,
        text: from.length > 1 ? `Merged into “${result.to}” on ${recipes}.` : `Renamed to “${result.to}” on ${recipes}.`,
      });
    });
  }

  const total = tags.filter((t) => picked.includes(t.tag)).reduce((n, t) => n + t.count, 0);
  const verb = picked.length > 1 ? "Merge" : "Rename";

  return (
    <>
      {note && (
        <p
          role="status"
          className={`mb-4 rounded-2xl border-2 px-4 py-3 font-semibold ${note.ok ? "border-ink bg-lemon text-ink" : "border-tomato bg-tomato/5 text-tomato-dark"}`}
        >
          {note.text}
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {tags.map((t) => {
          const on = picked.includes(t.tag);
          return (
            <li key={t.tag}>
              <label
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink px-4 py-2 transition-colors ${
                  on ? "bg-ink text-cream" : "bg-paper hover:bg-lemon"
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(t.tag)} className="h-5 w-5 flex-none accent-tomato" />
                <span className="flex-1 font-semibold">{t.tag}</span>
                <span className={`text-sm ${on ? "text-cream/80" : "text-muted"}`}>
                  {t.count} {t.count === 1 ? "recipe" : "recipes"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-cream px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_0_var(--color-ink)] sm:px-6">
          <form
            className="mx-auto flex max-w-[720px] flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="min-w-0 flex-1 basis-full sm:basis-56">
              <label htmlFor={`${id}-name`} className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-muted">
                {picked.length > 1 ? `Merge ${picked.length} tags into` : `Rename “${picked[0]}” to`} · {total}{" "}
                {total === 1 ? "recipe" : "recipes"}
              </label>
              <input
                id={`${id}-name`}
                value={name}
                maxLength={40}
                onChange={(e) => {
                  setName(e.target.value);
                  setTyped(true);
                }}
                className="min-h-11 w-full rounded-xl border-2 border-ink bg-paper px-3 text-ink focus:shadow-pop-sm focus:outline-none"
              />
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPicked([]);
                  setName("");
                  setTyped(false);
                }}
                className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name.trim()}
                className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50"
              >
                {pending ? "Saving…" : verb}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
