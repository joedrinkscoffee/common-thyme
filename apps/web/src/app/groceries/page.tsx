import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/components/site-header";
import { GroceryListSkeleton } from "@/components/skeletons";
import { GroceryListView } from "@/components/grocery-list";
import { getViewer } from "@/lib/household";
import { chefContext } from "@/lib/chef/server";
import { addDays, todayIn, weekRangeLabel, weekStartOf } from "@/lib/chef/dates";
import { buildGroceryList } from "@/lib/grocery/list";
import { defaultGroceryWeek, groceryWeekParam } from "@/lib/grocery/week";
import { sampleGroceryWeek } from "@/lib/grocery/sample";
import type { GroceryWeek } from "@/lib/chef/store";

async function Groceries({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "signed-in" && !viewer.household) redirect("/");
  const { week: param } = await searchParams;

  let today: string;
  let week: string;
  let data: GroceryWeek;
  let firstName: string | null = "Joe";
  let otherWeekHasMeals = true;
  if (viewer.kind === "sample") {
    await connection();
    today = todayIn("America/New_York");
    week = groceryWeekParam(param, today) ?? addDays(weekStartOf(today), 7);
    data = sampleGroceryWeek(week);
  } else {
    const ctx = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household! });
    firstName = viewer.firstName;
    today = ctx.today;
    const thisWeek = weekStartOf(today);
    const nextWeek = addDays(thisWeek, 7);
    const asked = groceryWeekParam(param, today);
    const [a, b] = await Promise.all([ctx.store.groceryWeek(thisWeek), ctx.store.groceryWeek(nextWeek)]);
    week = asked ?? defaultGroceryWeek(today, (w) => (w === thisWeek ? a : b).meals.length > 0);
    data = week === thisWeek ? a : b;
    otherWeekHasMeals = (week === thisWeek ? b : a).meals.length > 0;
  }

  const thisWeek = weekStartOf(today);
  const list = buildGroceryList(data.meals, data.marks);
  return (
    <GroceryListView
      key={week}
      weekStart={week}
      range={weekRangeLabel(week)}
      tabs={[
        { weekStart: thisWeek, label: "This week", active: week === thisWeek, empty: week !== thisWeek && !otherWeekHasMeals },
        { weekStart: addDays(thisWeek, 7), label: "Next week", active: week !== thisWeek, empty: week === thisWeek && !otherWeekHasMeals },
      ]}
      list={list}
      ready={data.ready}
      haveReady={data.haveReady}
      firstName={firstName}
      sample={viewer.kind === "sample"}
    />
  );
}

export default function GroceriesPage({ searchParams }: PageProps<"/groceries">) {
  return (
    <>
      <SiteHeader active="groceries" />
      <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-16 sm:px-6">
        <Suspense fallback={<GroceryListSkeleton />}>
          <Groceries searchParams={searchParams as Promise<{ week?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
