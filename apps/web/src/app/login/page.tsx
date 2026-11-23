import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { GoogleSignIn } from "@/components/google-sign-in";
import { LoginDemo } from "@/components/login-demo";

export const metadata: Metadata = { title: "Sign in · Common Thyme" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <div className="font-display text-lg font-extrabold">
        Common <span className="text-tomato">Thyme</span>
      </div>
      <div className="mx-auto mt-6 w-full max-w-[350px]">
        <LoginDemo />
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
