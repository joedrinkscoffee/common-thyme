"use client";

import { useState, useTransition } from "react";
import { checkInDinner } from "@/app/chef-actions";

/** Meals marked cooked on this page just now, so their stamp lands with a thump (and only then). */
const justCooked = new Set<string>();

/** The green COOKED stamp on a meal's photo. */
export function CookedStamp({ dinnerId }: { dinnerId: string }) {
  const [fresh] = useState(() => justCooked.delete(dinnerId));
  return (
    <span data-fresh={fresh || undefined} className="ink-stamp -rotate-[10deg] bg-paper/85 text-[#2f7a3e]">
      Cooked
    </span>
  );
}

const small =
  "min-h-8 w-full whitespace-nowrap rounded-full border-[1.5px] border-ink px-1.5 text-[12px] font-bold transition-colors hover:bg-lemon disabled:cursor-wait disabled:opacity-60";

/** The Cooked mark in a dinner card's footer, and its Undo. */
export function DinnerMark({ dinnerId, status, title, sample = false }: { dinnerId: string; status: "planned" | "cooked" | "skipped"; title: string; sample?: boolean }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(status);
  const [from, setFrom] = useState(status);
  if (from !== status) {
    setFrom(status);
    setShown(status);
  }

  const act = (action: "cooked" | "undo", next: "planned" | "cooked") =>
    start(async () => {
      setError(null);
      if (next === "cooked") justCooked.add(dinnerId);
      if (sample) return setShown(next);
      const r = await checkInDinner(dinnerId, action);
      if (r.ok) setShown(next);
      else setError(r.error ?? "Couldn't save that.");
    });

  return (
    <div className="flex flex-col gap-1">
      {shown === "planned" ? (
        <button type="button" disabled={busy} onClick={() => act("cooked", "cooked")} className={`${small} bg-paper`} aria-label={`Mark ${title} cooked`}>
          Mark cooked
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => act("undo", "planned")} className={`${small} bg-paper`} aria-label={`Undo: ${title} ${shown}`}>
          Undo
        </button>
      )}
      {error && (
        <span role="alert" className="text-[12px] text-tomato-dark">
          {error}
        </span>
      )}
    </div>
  );
}
