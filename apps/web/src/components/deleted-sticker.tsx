"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreRecipe } from "@/app/recipes/[id]/actions";

/** "Deleted. Undo" sticker shown on the library for a few seconds after a delete. */
export function DeletedSticker({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      router.replace("/recipes", { scroll: false });
    }, 10_000);
    return () => clearTimeout(t);
  }, [router]);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div role="status" className="flex -rotate-1 flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-lemon px-4 py-2.5 shadow-pop">
        <span className="font-semibold">
          Deleted &ldquo;{title}&rdquo;.
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await restoreRecipe(id);
              if (!r.ok) return setError(r.error ?? "Couldn't undo.");
              setVisible(false);
              router.push(`/recipes/${id}`);
            })
          }
          className="rounded-full border-2 border-ink bg-paper px-3.5 py-1 text-sm font-extrabold transition hover:-translate-y-0.5 hover:bg-ink hover:text-cream disabled:cursor-wait"
        >
          {pending ? "Undoing…" : "Undo"}
        </button>
        {error && <span className="text-sm font-semibold text-tomato-dark">{error}</span>}
      </div>
    </div>
  );
}
