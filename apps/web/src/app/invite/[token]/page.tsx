import { Suspense } from "react";
import type { Metadata } from "next";
import { AcceptInvite } from "@/components/accept-invite";
import { ChefAvatar } from "@/components/chef-avatar";

export const metadata: Metadata = { title: "Join a household · Common Thyme" };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvite token={token} />;
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
      <div className="rounded-[22px] border-2 border-ink bg-paper p-6 shadow-pop-lg">
        <div className="mb-4 flex items-center gap-3">
          <ChefAvatar size={44} />
          <div className="font-brand text-xl font-normal">Chef</div>
        </div>
        <h1 className="m-0 font-display text-3xl font-extrabold leading-tight">You&apos;re invited to plan dinners together.</h1>
        <p className="mb-6 mt-2 leading-relaxed text-muted">
          Join the household to see the week, swap dinners and tell Chef what&apos;s going on.
        </p>
        <Suspense fallback={<div className="min-h-[52px]" />}>
          <Invite params={props.params} />
        </Suspense>
      </div>
    </main>
  );
}
