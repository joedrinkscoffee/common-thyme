import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { ChefSession } from "./session";
import { applyCheckIn } from "./check-in";
import type { CatalogRecipe } from "./planner";

const r = (id: string, useUp: string[], tags: string[] = [], minutes = 40): CatalogRecipe => ({ id, title: id[0].toUpperCase() + id.slice(1), tags, totalMinutes: minutes, useUp });
const recipes = () => [
  r("piccata", ["parsley", "chicken"]),
  r("orzo", ["parsley", "shrimp"]),
  r("pesto", ["spinach", "ricotta"]),
  r("quesadilla", ["kale", "jack"], [], 20),
  r("salad", ["kale", "goat cheese"], [], 15),
  r("tacos", ["cilantro", "fish"]),
  r("curry", ["coconut", "spinach"]),
  r("pancakes", ["buttermilk"], ["breakfast"], 25),
];
// Sunday Nov 29, planning the week of Nov 30.
const TODAY = "2026-11-29";
const WEEK = "2026-11-30";

async function setup() {
  const store = new MemoryStore(recipes());
  const session = new ChefSession(store, TODAY);
  await session.load();
  return { store, session };
}
const slots = (store: MemoryStore) =>
  store.dinnerList
    .filter((d) => d.status !== "moved")
    .map((d) => `${d.date} ${d.meal}`)
    .sort();

describe("meal types", () => {
  it("plans weeknight dinners plus Saturday lunch and Sunday dinner", async () => {
    const { store, session } = await setup();
    const out = await session.planWeekTool({
      week_start: WEEK,
      kid_nights: 0,
      meals: [
        { date: "2026-12-05", meal: "lunch" },
        { date: "2026-12-06", meal: "dinner" },
      ],
    });
    expect(out.ok).toBe(true);
    expect(slots(store)).toEqual([
      "2026-11-30 dinner",
      "2026-12-01 dinner",
      "2026-12-02 dinner",
      "2026-12-03 dinner",
      "2026-12-04 dinner",
      "2026-12-05 lunch",
      "2026-12-06 dinner",
    ]);
    // Breakfast recipes stay out of lunches and dinners.
    expect(store.dinnerList.some((d) => d.recipeId === "pancakes")).toBe(false);
    expect(out.text).toContain("Sat 2026-12-05 lunch:");
  });

  it("plans breakfasts from recipes tagged breakfast, and says when there are none", async () => {
    const { store, session } = await setup();
    await session.planWeekTool({ week_start: WEEK, nights: ["2026-11-30"], meals: [{ date: "2026-12-06", meal: "breakfast" }] });
    expect(store.dinnerList.find((d) => d.meal === "breakfast")?.recipeId).toBe("pancakes");

    const plain = new MemoryStore(recipes().filter((x) => x.id !== "pancakes"));
    const s2 = new ChefSession(plain, TODAY);
    await s2.load();
    const out = await s2.planWeekTool({ week_start: WEEK, nights: ["2026-11-30"], meals: [{ date: "2026-12-06", meal: "breakfast" }] });
    expect(out.text).toContain("No recipes are tagged breakfast");
  });

  it("allows a lunch and a dinner on the same day, and moves between meals", async () => {
    const { store, session } = await setup();
    await session.addDinnerTool({ date: "2026-12-05", recipe: session.recipeRefFor("tacos") });
    const lunch = await session.addDinnerTool({ date: "2026-12-05", meal: "lunch", recipe: session.recipeRefFor("salad") });
    expect(lunch.ok).toBe(true);
    const again = await session.addDinnerTool({ date: "2026-12-05", meal: "lunch", recipe: session.recipeRefFor("orzo") });
    expect(again.ok).toBe(false);

    const ref = session.dinnerRefFor(store.dinnerList.find((d) => d.meal === "lunch")!.id);
    const moved = await session.moveDinnerTool({ dinner: ref, to_date: "2026-12-06", to_meal: "dinner" });
    expect(moved.ok).toBe(true);
    expect(slots(store)).toEqual(["2026-12-05 dinner", "2026-12-06 dinner"]);
  });

  it("replanning the week keeps lunches it wasn't asked about", async () => {
    const { store, session } = await setup();
    await session.addDinnerTool({ date: "2026-11-30", meal: "lunch", recipe: session.recipeRefFor("salad") });
    await session.planWeekTool({ week_start: WEEK, kid_nights: 0 });
    expect(store.dinnerList.find((d) => d.meal === "lunch")?.recipeId).toBe("salad");
    expect(slots(store).filter((x) => x.endsWith("dinner"))).toHaveLength(5);
  });
});

describe("check-ins with meal types", () => {
  it("pushing a dinner skips Thanksgiving and the leftovers night", async () => {
    const store = new MemoryStore(recipes());
    const plan = await store.ensurePlan("2026-11-23");
    for (const [date, id] of [["2026-11-23", "piccata"], ["2026-11-24", "orzo"], ["2026-11-25", "pesto"]] as const) {
      await store.addDinner({ planId: plan.id, date, recipeId: id, sharedWithKids: false, servings: 2 });
    }
    const tue = store.dinnerList.find((d) => d.date === "2026-11-24")!;
    const res = await applyCheckIn(store, tue.id, "later", "2026-11-24");
    // Wednesday has pesto; Thursday is Thanksgiving and Friday leftovers, so Saturday.
    expect(res.ok).toBe(true);
    const moved = store.dinnerList.find((d) => d.recipeId === "orzo" && d.status === "planned")!;
    expect(moved.date).toBe("2026-11-28");
    expect(moved.meal).toBe("dinner");
  });

  it("a lunch moves to the next open lunch, even on a day with dinner", async () => {
    const store = new MemoryStore(recipes());
    const plan = await store.ensurePlan("2026-11-30");
    await store.addDinner({ planId: plan.id, date: "2026-12-05", recipeId: "piccata", sharedWithKids: false, servings: 2 });
    const lunch = await store.addDinner({ planId: plan.id, date: "2026-12-04", meal: "lunch", recipeId: "salad", sharedWithKids: false, servings: 2 });
    const res = await applyCheckIn(store, lunch.id, "later", "2026-12-04");
    expect(res.ok).toBe(true);
    const moved = store.dinnerList.find((d) => d.recipeId === "salad" && d.status === "planned")!;
    expect([moved.date, moved.meal]).toEqual(["2026-12-05", "lunch"]);
  });
});
