"use client";

import { useState, useTransition } from "react";
import { dismissRebuiltNotice } from "@/app/recipes/[id]/actions";

/** The lemon sticker on a recipe whose original page is gone. The × hides it for good. */
export function RebuiltStepsNotice({ recipeId }: { recipeId: string }) {
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <div className="mb-0 mt-4">
      <p className="m-0 inline-flex -rotate-1 items-start gap-3 rounded-xl border-2 border-ink bg-lemon py-2 pl-3 pr-2 text-sm font-semibold">
        <span>The original page is gone, so Chef rebuilt these steps from what was saved.</span>
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => {
            setHidden(true);
            setError(null);
            startTransition(async () => {
              const r = await dismissRebuiltNotice(recipeId);
              if (!r.ok) {
                setHidden(false);
                setError(r.error ?? "Couldn't hide this.");
              }
            });
          }}
          className="-my-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 border-ink bg-paper text-base leading-none transition hover:-translate-y-0.5 hover:bg-ink hover:text-lemon"
        >
          ×
        </button>
      </p>
      {error && <p className="m-0 mt-2 text-sm font-semibold text-tomato-dark">{error}</p>}
    </div>
  );
}
