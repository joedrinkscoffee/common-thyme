"use client";

import { useState, useTransition } from "react";
import { tidyIngredients } from "@/app/recipes/import/actions";

/** One-time button that splits imported ingredient lines into parts, so Chef matches on the base ingredient. */
export function TidyIngredients({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section className="mb-6 rounded-[22px] border-2 border-ink bg-paper p-5 shadow-pop-sm">
      <h2 className="m-0 font-display text-xl font-extrabold">Tidy up ingredients</h2>
      <p className="mb-4 mt-2 leading-relaxed text-muted">
        {count.toLocaleString()} imported ingredient {count === 1 ? "line still mixes" : "lines still mix"} prep words in with the
        ingredient, like &ldquo;1 shredded carrot&rdquo;. Tidying splits them into amount, unit, ingredient and prep, so Chef matches
        carrots across recipes however they&rsquo;re cut.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await tidyIngredients();
            setMessage(r.ok ? `Tidied ${r.tidied.toLocaleString()} lines.` : (r.error ?? "Couldn't tidy them. Try again?"));
          })
        }
        className="rounded-full border-2 border-ink bg-tomato px-4 py-2 font-bold text-white shadow-pop-sm transition hover:-translate-y-0.5 hover:bg-tomato-dark disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? "Tidying…" : "Tidy ingredient lines"}
      </button>
      {message && (
        <p role="status" className="mb-0 mt-3 text-sm font-semibold">
          {message}
        </p>
      )}
    </section>
  );
}
