"use client";

import { useActionState } from "react";
import { acceptInvite, type ActionResult } from "@/app/actions";

export function AcceptInvite({ token }: { token: string }) {
  const [state, action, pending] = useActionState(async (): Promise<ActionResult> => acceptInvite(token), null);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="min-h-[52px] w-full rounded-full bg-tomato px-6 font-bold text-white disabled:opacity-60">
        {pending ? "Joining…" : "Join the household"}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm text-tomato-dark">
        {state?.error}
      </p>
    </form>
  );
}
