import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { ensureDrafts, weeksToDraft } from "./auto-draft";
import type { CatalogRecipe } from "./planner";

const r = (id: string, useUp: string[], tags: string[] = []): CatalogRecipe => ({ id, title: id[0].toUpperCase() + id.slice(1), tags, totalMinutes: 30, useUp });
const recipes = () => [
  r("piccata", ["parsley", "chicken"], ["kid friendly"]),
  r("orzo", ["parsley", "shrimp"]),
  r("pesto", ["spinach", "ricotta"], ["kid friendly"]),
  r("quesadilla", ["kale", "jack"], ["kid friendly"]),
  r("salad", ["kale", "goat cheese"]),
  r("tacos", ["cilantro", "fish"]),
  r("curry", ["coconut", "spinach"]),
];

describe("auto-draft", () => {
  it("picks the weeks to look at", () => {
    expect(weeksToDraft("2026-11-16", 5)).toEqual(["2026-11-16"]); // Monday
    expect(weeksToDraft("2026-11-19", 5)).toEqual(["2026-11-16"]); // Thursday: Thu and Fri left
    expect(weeksToDraft("2026-11-22", 5)).toEqual(["2026-11-23"]); // Sunday
    expect(weeksToDraft("2026-11-25", 5)).toEqual([]); // Thanksgiving Wednesday: only tonight left
  });

  it("drafts Thanksgiving week with three dinners and asks", async () => {
    const store = new MemoryStore(recipes());
    const drafted = new Set<string>();
    const msgs = await ensureDrafts({ store, today: "2026-11-22", hasDrafted: async (w) => drafted.has(w) });
    expect(msgs).toHaveLength(1);
    const dates = store.dinnerList.map((d) => d.date).sort();
    expect(dates).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(msgs[0].body).toContain("Thanksgiving week");
    expect(msgs[0].body).toContain("Thursday for Thanksgiving and Friday for leftovers");
    expect(msgs[0].body).toContain("Anything in particular this week?");
    expect(msgs[0].choice.choices.length).toBeGreaterThan(1);
    expect(store.plansList[0].status).toBe("draft");
  });

  it("runs once and leaves weeks they planned alone", async () => {
    const store = new MemoryStore(recipes());
    const plan = await store.ensurePlan("2026-11-23");
    await store.addDinner({ planId: plan.id, date: "2026-11-24", recipeId: "tacos", sharedWithKids: false, servings: 2 });
    expect(await ensureDrafts({ store, today: "2026-11-22", hasDrafted: async () => false })).toEqual([]);
    expect(store.dinnerList).toHaveLength(1);

    const empty = new MemoryStore(recipes());
    expect(await ensureDrafts({ store: empty, today: "2026-11-22", hasDrafted: async () => true })).toEqual([]);
    expect(empty.dinnerList).toHaveLength(0);
  });

  it("still drafts around a dinner carried over from last week", async () => {
    const store = new MemoryStore(recipes());
    const last = await store.ensurePlan("2026-11-16");
    const next = await store.ensurePlan("2026-11-23");
    const old = await store.addDinner({ planId: last.id, date: "2026-11-20", recipeId: "tacos", sharedWithKids: true, servings: 4 });
    const carried = await store.addDinner({ planId: next.id, date: "2026-11-23", recipeId: "tacos", sharedWithKids: true, servings: 4 });
    await store.updateDinner(old.id, { status: "moved", movedTo: carried.id });
    const msgs = await ensureDrafts({ store, today: "2026-11-22", hasDrafted: async () => false });
    expect(msgs).toHaveLength(1);
    const live = store.dinnerList.filter((d) => d.status !== "moved" && d.date >= "2026-11-23");
    expect(live.map((d) => d.date).sort()).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(live.find((d) => d.date === "2026-11-23")!.recipeId).toBe("tacos");
  });
});
