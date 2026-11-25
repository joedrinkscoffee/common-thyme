import Link from "next/link";
import { ChefAvatar } from "@/components/chef-avatar";

/** The single card the invite-only and invite-link pages are built on. */
export function InviteCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <Link href="/login" className="font-display text-lg font-extrabold text-ink no-underline">
        Common <span className="text-tomato">Thyme</span>
      </Link>
      <div className="flex flex-1 flex-col justify-center py-8">
        <div className="rounded-[22px] border-2 border-ink bg-paper p-6 shadow-pop-lg">
          <div className="mb-4 flex items-center gap-3">
            <ChefAvatar size={44} />
            <div className="font-display text-xl font-extrabold">Chef</div>
          </div>
          <h1 className="m-0 font-display text-3xl font-extrabold leading-tight">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

export function SignOutButton({ label = "Sign out" }: { label?: string }) {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="min-h-[48px] w-full rounded-full border-2 border-ink bg-paper px-6 font-bold transition-colors hover:bg-lemon">
        {label}
      </button>
    </form>
  );
}
