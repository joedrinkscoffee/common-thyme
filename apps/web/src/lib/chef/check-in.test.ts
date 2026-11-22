import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { ChefSession } from "./session";
import { applyCheckIn, dueReminder, rollOver, undoCheckIn, unmarked } from "./check-in";
import { buildReminderEmail } from "./reminder-email";
import type { CatalogRecipe } from "./planner";

const r = (id: string, useUp: string[]): CatalogRecipe => ({ id, title: id[0].toUpperCase() + id.slice(1), tags: [], totalMinutes: 30, useUp });
const recipes = () => [
  r("piccata", ["chicken breast", "parsley"]),
  r("orzo", ["spinach", "shrimp"]),
  r("pesto", ["pesto", "spinach"]),
  r("quesadilla", ["kale", "scallion"]),
  r("ramen", ["kale", "shiitake"]),
  r("tacos", []),
  r("curry", ["spinach"]),
];

// Week of Mon Nov 23 2026. Thursday is the 26th.
const THURSDAY = "2026-11-26";

async function week(dates: [string, string][]) {
  const store = new MemoryStore(recipes());
  const ids: string[] = [];
  for (const [date, recipeId] of dates) {
    const plan = await store.ensurePlan("2026-11-23");
    ids.push((await store.addDinner({ planId: plan.id, date, recipeId, sharedWithKids: false, servings: 2 })).id);
  }
  return { store, ids };
}
const live = (store: MemoryStore) => store.dinnerList.filter((d) => d.status !== "moved").sort((a, b) => a.date.localeCompare(b.date));

describe("check-ins", () => {
  it("marks a dinner cooked for its own week, and Undo puts it back", async () => {
    const { store, ids } = await week([["2026-11-24", "piccata"]]);
    const res = await applyCheckIn(store, ids[0], "cooked", THURSDAY);
    expect(res).toMatchObject({ ok: true, change: "Marked Piccata cooked", undo: ids[0] });
    expect((await store.dinner(ids[0]))!.status).toBe("cooked");
    expect((await applyCheckIn(store, ids[0], "cooked", THURSDAY)).ok).toBe(false);
    expect((await undoCheckIn(store, ids[0])).ok).toBe(true);
    expect((await store.dinner(ids[0]))!.status).toBe("planned");
  });

  it("won't mark a dinner in a later week cooked", async () => {
    const store = new MemoryStore(recipes());
    const plan = await store.ensurePlan("2026-11-30");
    const d = await store.addDinner({ planId: plan.id, date: "2026-12-01", recipeId: "orzo", sharedWithKids: false, servings: 2 });
    expect((await applyCheckIn(store, d.id, "cooked", THURSDAY)).ok).toBe(false);
  });

  it("moves a missed dinner to the next open night this week", async () => {
    const { store, ids } = await week([
      ["2026-11-24", "piccata"],
      ["2026-11-26", "orzo"],
      ["2026-11-27", "pesto"],
    ]);
    const res = await applyCheckIn(store, ids[0], "later", THURSDAY);
    expect(res).toMatchObject({ ok: true, change: "Moved Piccata to Saturday" });
    expect(live(store).map((d) => `${d.date} ${d.recipeId}`)).toEqual(["2026-11-26 orzo", "2026-11-27 pesto", "2026-11-28 piccata"]);
    // Undo removes the copy and restores the original night.
    await undoCheckIn(store, ids[0]);
    expect(live(store).map((d) => d.date)).toEqual(["2026-11-24", "2026-11-26", "2026-11-27"]);
  });

  it("pushes to the earliest open night next week, and twice-pushed dinners go back to the library", async () => {
    const { store, ids } = await week([["2026-11-24", "piccata"]]);
    const first = await applyCheckIn(store, ids[0], "next_week", THURSDAY);
    expect(first).toMatchObject({ ok: true, change: "Pushed Piccata to Mon, Nov 30" });
    const moved = live(store)[0];
    expect(moved).toMatchObject({ date: "2026-11-30", pushCount: 1 });

    // Pushed again from next week: lands the week after.
    const second = await applyCheckIn(store, moved.id, "next_week", "2026-12-01");
    expect(second.ok).toBe(true);
    const again = live(store)[0];
    expect(again).toMatchObject({ date: "2026-12-07", pushCount: 2 });

    const third = await applyCheckIn(store, again.id, "next_week", "2026-12-08");
    expect(third).toMatchObject({ ok: true, change: "Put Piccata back in your recipes" });
    expect((await store.dinner(again.id))!.status).toBe("skipped");
  });

  it("finds the dinners through Thursday that nobody marked", async () => {
    const { store, ids } = await week([
      ["2026-11-23", "piccata"],
      ["2026-11-25", "orzo"],
      ["2026-11-26", "pesto"],
      ["2026-11-27", "ramen"],
    ]);
    await store.updateDinner(ids[0], { status: "cooked" });
    await store.updateDinner(ids[1], { status: "skipped" });
    expect(unmarked(store.dinnerList, "2026-11-23", THURSDAY).map((d) => d.recipeId)).toEqual(["pesto"]);
    await store.updateDinner(ids[2], { status: "cooked" });
    // Everything through Thursday is marked, so no Thursday email.
    expect(unmarked(store.dinnerList, "2026-11-23", THURSDAY)).toEqual([]);
  });
});

describe("reminder timing", () => {
  it("is due Thursday from 7 PM and Sunday from 9 AM, local time", () => {
    expect(dueReminder(THURSDAY, 18)).toBeNull();
    expect(dueReminder(THURSDAY, 19)).toEqual({ kind: "thursday", weekStart: "2026-11-23", through: THURSDAY });
    expect(dueReminder("2026-11-29", 8)).toBeNull();
    expect(dueReminder("2026-11-29", 9)).toEqual({ kind: "sunday", weekStart: "2026-11-23", through: "2026-11-28" });
    expect(dueReminder("2026-11-27", 20)).toBeNull();
  });

  it("builds an email with one-tap links for each unmarked dinner", () => {
    const email = buildReminderEmail({
      kind: "thursday",
      firstName: "Joe",
      weekStart: "2026-11-23",
      dinners: [{ id: "d1", date: "2026-11-24", title: "Chicken <Piccata>" }],
      link: (id, a) => `https://x.test/check-in?t=${id}-${a}`,
      homeUrl: "https://x.test",
    });
    expect(email.subject).toBe("Did you make Chicken <Piccata>?");
    expect(email.html).toContain("Chicken &lt;Piccata&gt;");
    for (const a of ["cooked", "later", "next_week", "skip"]) expect(email.html).toContain(`t=d1-${a}`);
    const sunday = buildReminderEmail({ kind: "sunday", firstName: null, weekStart: "2026-11-23", dinners: [{ id: "d1", date: "2026-11-24", title: "X" }], link: (id, a) => `${id}-${a}`, homeUrl: "h" });
    expect(sunday.html).not.toContain("d1-later");
  });
});

describe("rollover when planning next week", () => {
  it("carries unmarked dinners in first, fresh-ingredient ones earliest, and plans around them", async () => {
    const { store, ids } = await week([
      ["2026-11-23", "tacos"],
      ["2026-11-24", "piccata"],
      ["2026-11-25", "orzo"],
    ]);
    await store.updateDinner(ids[2], { status: "cooked" });
    const session = new ChefSession(store, "2026-11-29");
    await session.load();
    const out = await session.planWeekTool({ week_start: "2026-11-30" });
    expect(out.ok).toBe(true);
    expect(out.text).toContain("carried over");
    const next = live(store).filter((d) => d.date >= "2026-11-30");
    expect(next).toHaveLength(5);
    // Piccata has fresh things to use up, so it goes first; tacos next.
    expect(next.slice(0, 2).map((d) => d.recipeId)).toEqual(["piccata", "tacos"]);
    expect(session.changes).toContain("Carried Piccata into the week of Nov 30");
    // Re-planning keeps them.
    await session.planWeekTool({ week_start: "2026-11-30", reshuffle: true });
    expect(live(store).filter((d) => d.date >= "2026-11-30").slice(0, 2).map((d) => d.recipeId)).toEqual(["piccata", "tacos"]);
  });

  it("sends a twice-pushed dinner back to the library instead", async () => {
    const store = new MemoryStore(recipes());
    const plan = await store.ensurePlan("2026-11-23");
    await store.addDinner({ planId: plan.id, date: "2026-11-24", recipeId: "ramen", sharedWithKids: false, servings: 2, pushCount: 2 });
    const res = await rollOver(store, "2026-11-30", "2026-11-29", () => []);
    expect(res).toEqual({ carried: [], returned: ["Ramen"] });
    expect(live(store).filter((d) => d.date >= "2026-11-30")).toEqual([]);
  });
});
