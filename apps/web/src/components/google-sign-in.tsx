"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";

/** `next` overrides the ?next= on the page, e.g. an invite link's claim step. */
export function GoogleSignIn({ next }: { next?: string } = {}) {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") ? "Sign-in didn't finish. Try again?" : null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  async function signIn() {
    if (!url || !key) {
      setError("Sign-in isn't set up yet.");
      return;
    }
    setBusy(true);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", safeNext(next ?? params.get("next")));
    const { error } = await createClient(url, key).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      setBusy(false);
      setError("Couldn't reach Google. Try again?");
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className={[
          "flex min-h-[52px] items-center justify-center gap-2.5 rounded-full border-2 border-ink bg-paper font-bold shadow-pop",
          // Lifts toward you on hover and presses in on click, like a sticker.
          "transition-[translate,box-shadow,background-color] duration-150 ease-out",
          "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-lemon hover:shadow-[6px_6px_0_var(--color-ink)]",
          "active:translate-x-0.5 active:translate-y-0.5 active:shadow-pop-sm",
          "motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
          "disabled:pointer-events-none disabled:opacity-60",
        ].join(" ")}
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.5 28.8c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.5 0 20.1 0 24s1 7.5 2.7 10.8l7.8-6z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      <p role="status" className="min-h-5 text-center text-sm text-tomato-dark">
        {error}
      </p>
    </div>
  );
}
