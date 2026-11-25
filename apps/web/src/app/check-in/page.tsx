import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ChefAvatar } from "@/components/chef-avatar";
import { ACTION_LABEL } from "@/lib/chef/check-in";
import { CheckInRunner } from "./check-in-runner";

export const metadata: Metadata = { title: "Check in · Common Thyme", robots: { index: false } };

const LABEL = { ...ACTION_LABEL, undo: "Undo" } as Record<string, string>;

function actionOf(token: string): string {
  try {
    const body = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")) as { a?: string };
    return LABEL[body.a ?? ""] ?? "your answer";
  } catch {
    return "your answer";
  }
}

async function CheckIn({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  if (!token) return <p className="m-0 text-lg">This link is missing its check-in. Open Chef to check in instead.</p>;
  return <CheckInRunner token={token} label={actionOf(token)} />;
}

/** Where the one-tap buttons in check-in emails land. */
export default function CheckInPage({ searchParams }: PageProps<"/check-in">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-5 py-8">
      <Link href="/" className="font-brand text-lg font-normal text-ink no-underline">
        Common <span className="text-tomato">Thyme</span>
      </Link>
      <section className="mt-8 flex flex-col gap-5 rounded-[28px] border-2 border-ink bg-paper p-6">
        <div className="flex items-center gap-3">
          <ChefAvatar size={44} />
          <div className="font-brand text-xl font-normal">Chef</div>
        </div>
        <Suspense fallback={<p className="m-0 text-lg">One moment…</p>}>
          <CheckIn searchParams={searchParams as Promise<{ t?: string | string[] }>} />
        </Suspense>
      </section>
    </main>
  );
}
