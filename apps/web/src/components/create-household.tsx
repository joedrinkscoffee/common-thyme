"use client";

import { useActionState } from "react";
import { createHousehold } from "@/app/actions";
import { ChefAvatar } from "./chef-avatar";

export function CreateHousehold({ firstName }: { firstName: string | null }) {
  const [state, action, pending] = useActionState(createHousehold, null);
  const suggestion = firstName ? `${firstName}'s kitchen` : "Our kitchen";
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-4 pb-8 sm:px-6">
      <div className="mb-5 flex items-center gap-3.5">
        <ChefAvatar />
        <div className="font-brand text-[22px] font-normal">Chef</div>
      </div>
      <div className="flex flex-col gap-4 text-lg leading-relaxed">
        <p className="m-0">Hi{firstName ? ` ${firstName}` : ""}, I&apos;m Chef. Every Sunday I&apos;ll draft your dinners so the groceries carry across nights.</p>
        <p className="m-0">First, what should I call your household? You can invite your partner right after.</p>
      </div>
      <form action={action} className="mt-6 rounded-[22px] border-2 border-ink bg-paper p-5 shadow-pop-lg">
        <label htmlFor="household-name" className="font-display text-xl font-extrabold">
          Household name
        </label>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <input
            id="household-name"
            name="name"
            defaultValue={suggestion}
            maxLength={80}
            required
            className="min-h-12 min-w-0 flex-[1_1_240px] rounded-full border-2 border-ink bg-cream px-4"
          />
          <button type="submit" disabled={pending} className="min-h-12 rounded-full bg-tomato px-6 font-bold text-white disabled:opacity-60">
            {pending ? "Setting up…" : "Let's go"}
          </button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm text-tomato-dark">
          {state?.error}
        </p>
      </form>
    </main>
  );
}
