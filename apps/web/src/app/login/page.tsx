import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { GoogleSignIn } from "@/components/google-sign-in";

export const metadata: Metadata = { title: "Sign in · Common Thyme" };

const TILES = [
  { tint: "#f0b98a", className: "left-0 top-8 -rotate-6" },
  { tint: "#9fcb8a", className: "right-0 top-0 rotate-5" },
  { tint: "#f2cf78", className: "left-1/2 top-28 -translate-x-1/2" },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <div className="font-display text-lg font-extrabold">
        Common <span className="text-tomato">Thyme</span>
      </div>
      <div aria-hidden="true" className="relative mx-auto mt-6 h-72 w-full max-w-[350px]">
        {TILES.map((t) => (
          <div
            key={t.tint}
            className={`absolute h-44 w-40 rounded-[20px] border-2 border-ink shadow-pop ${t.className}`}
            style={{ background: t.tint }}
          />
        ))}
        <span className="absolute bottom-0 left-2 -rotate-3 rounded-full border-2 border-ink bg-lemon px-3 py-1.5 font-bold">
          Lemon × 3
        </span>
        <span className="absolute bottom-6 right-4 rotate-3 rounded-full border-2 border-ink bg-kale px-3 py-1.5 font-bold">
          Kale × 2
        </span>
      </div>
      <h1 className="mt-8 font-display text-4xl font-extrabold leading-none tracking-tight">
        Dinners that share the shopping.
      </h1>
      <p className="mt-3 leading-relaxed text-muted">
        Chef drafts your week on Sunday. You tweak it, lock it in, and nothing fresh goes to waste.
      </p>
      <div className="flex-1" />
      <div className="mt-8">
        <Suspense fallback={<div className="min-h-[52px]" />}>
          <GoogleSignIn />
        </Suspense>
        <p className="text-center text-[13px] text-muted">Got an invite link? Open it, then sign in here.</p>
        <p className="mt-2 text-center text-[13px] text-muted">
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
        </p>
      </div>
    </main>
  );
}
