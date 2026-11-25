"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RecipeCard } from "@/lib/recipes";
import { countTags, tagKey } from "@/lib/tags";
import { DishPlaceholder } from "./dish-art";


/** Square recipe cards with a search box and cuisine chips. */
export function RecipeLibrary({ recipes }: { recipes: RecipeCard[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  // "Asian" and "asian" are one chip.
  const tags = useMemo(() => countTags(recipes.map((r) => r.tags)).map((c) => c.tag), [recipes]);

  const q = query.trim().toLowerCase();
  const shown = recipes.filter(
    (r) => (!tag || r.tags.some((t) => tagKey(t) === tagKey(tag))) && (!q || r.title.toLowerCase().includes(q)),
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label htmlFor="recipe-search" className="sr-only">
          Search recipes
        </label>
        <input
          id="recipe-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="min-h-11 w-full rounded-full border-2 border-ink bg-paper px-4 sm:w-64"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cuisine">
          {[null, ...tags].map((t) => (
            <button
              key={t ?? "all"}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(t)}
              className={`min-h-9 rounded-full border-2 border-ink px-3.5 text-sm font-semibold transition-colors ${
                tag === t ? "bg-ink text-cream" : "bg-paper hover:bg-lemon"
              }`}
            >
              {t ?? "All"}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted">No recipes match that.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recipes/${r.id}`}
                className="group block overflow-hidden rounded-2xl border-2 border-ink bg-paper text-ink no-underline transition-[translate,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--color-ink)] motion-reduce:transition-none"
              >
                <div className="relative aspect-square">
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URLs from a private bucket
                    <img src={r.photoUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <DishPlaceholder seed={r.id} />
                  )}
                  {r.tags[0] && (
                    <span className="absolute left-2 top-2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">
                      {r.tags[0]}
                    </span>
                  )}
                </div>
                <div className="px-2.5 pb-2.5 pt-2">
                  <div className="font-display text-sm font-bold leading-tight">{r.title}</div>
                  {r.totalMinutes && <div className="mt-0.5 text-[12px] text-muted">{r.totalMinutes} min</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
