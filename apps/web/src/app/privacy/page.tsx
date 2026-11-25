import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Common Thyme" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 leading-relaxed">
      <Link href="/" className="font-brand text-lg font-normal text-ink no-underline">
        Common <span className="text-tomato">Thyme</span>
      </Link>
      <h1 className="mt-8 font-display text-4xl font-extrabold leading-none tracking-tight">Privacy</h1>
      <p className="mt-2 text-[13px] text-muted">Last updated November 22, 2026</p>

      <h2 className="mt-8 font-display text-xl font-extrabold">What we collect</h2>
      <p>
        When you sign in with Google, we receive your name, email address and profile photo. We use them only to
        sign you in and to show your household who is who. Inside the app we store what you add: your household,
        recipes, meal plans, and notes Chef keeps about your preferences. If you link a calendar, we store its
        private link and read it when Chef plans; we don&apos;t keep copies of your events.
      </p>

      <h2 className="mt-8 font-display text-xl font-extrabold">How it is used</h2>
      <p>
        Your data is used only to plan your dinners. Chef sends your recipes, plans and notes to Anthropic&apos;s
        Claude API to draft and adjust your week. With a linked calendar, that includes the titles and times of
        evening events and trips in the weeks being planned, nothing else from your calendar. Check-in emails
        (Thursday evening and Sunday morning, only when meals are still unmarked) are sent through Resend, which
        receives your email address and the meal names. We don&apos;t sell your data, show ads, or share it with
        anyone else.
      </p>

      <h2 className="mt-8 font-display text-xl font-extrabold">Who can see it</h2>
      <p>
        Only members of your household can see your household&apos;s recipes and plans. Data is stored with Supabase
        and the app is hosted on Vercel.
      </p>

      <h2 className="mt-8 font-display text-xl font-extrabold">Deleting your data</h2>
      <p>
        Ask the household owner who invited you, or contact the app owner, and we&apos;ll delete your account and
        everything tied to it.
      </p>
    </main>
  );
}
