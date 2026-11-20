import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChefWeek } from "@/components/chef-week";
import { CreateHousehold } from "@/components/create-household";
import { InvitePartner } from "@/components/invite-partner";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/household";
import { sampleWeek } from "@/lib/sample-week";

async function HomeContent() {
  const viewer = await getViewer();

  if (viewer.kind === "sample") {
    return <ChefWeek initialWeek={sampleWeek} statusLabel="Sample week · not connected yet" />;
  }
  if (viewer.kind === "signed-out") redirect("/login");
  if (!viewer.household) return <CreateHousehold firstName={viewer.firstName} />;

  return (
    <ChefWeek
      initialWeek={sampleWeek}
      firstName={viewer.firstName}
      statusLabel={`${viewer.household.name} · sample week until your recipes are in`}
      partnerSlot={viewer.household.memberCount < 2 ? <InvitePartner /> : null}
    />
  );
}

function HomeLoading() {
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 sm:px-6" aria-busy="true">
      <p className="text-muted">Chef is getting your week…</p>
    </main>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<HomeLoading />}>
        <HomeContent />
      </Suspense>
    </>
  );
}
