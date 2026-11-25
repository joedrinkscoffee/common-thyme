import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChefChat } from "@/components/chef-chat";
import { CreateHousehold } from "@/components/create-household";
import { InvitePartner } from "@/components/invite-partner";
import { SiteHeader } from "@/components/site-header";
import { WeekBoard } from "@/components/week-board";
import { TimezoneSync } from "@/components/timezone-sync";
import { ChefHomeSkeleton } from "@/components/skeletons";
import { getViewer } from "@/lib/household";
import { loadChefHome } from "@/lib/chef/server";
import { sampleHome } from "@/lib/chef/sample-home";
import type { ChefHomeData } from "@/lib/chef/home";

function Home({ data, statusLabel, partnerSlot = null, sample = false }: { data: ChefHomeData; statusLabel: string; partnerSlot?: React.ReactNode; sample?: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-wrap items-start gap-8 px-4 pb-6 sm:px-6">
      <ChefChat
        brief={data.brief}
        initialMessages={data.messages}
        connected={data.connected}
        firstName={data.firstName}
        statusLabel={statusLabel}
        today={data.today}
        partnerSlot={partnerSlot}
        sample={sample}
      />
      <WeekBoard weeks={data.weeks} today={data.today} sample={sample} />
    </main>
  );
}

async function HomeContent({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const viewer = await getViewer();

  if (viewer.kind === "sample") {
    const { day } = await searchParams;
    return <Home data={await sampleHome(day)} statusLabel="Sample week · not connected yet" sample />;
  }
  if (viewer.kind === "signed-out") redirect("/login");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (!viewer.household) return <CreateHousehold firstName={viewer.firstName} />;

  const data = await loadChefHome({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
  const status = data.connected ? viewer.household.name : `${viewer.household.name} · Chef isn't connected yet`;
  return (
    <>
      <TimezoneSync />
      <Home data={data} statusLabel={status} partnerSlot={viewer.household.memberCount < 2 ? <InvitePartner /> : null} />
    </>
  );
}

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<ChefHomeSkeleton />}>
        <HomeContent searchParams={searchParams as Promise<{ day?: string }>} />
      </Suspense>
    </>
  );
}
