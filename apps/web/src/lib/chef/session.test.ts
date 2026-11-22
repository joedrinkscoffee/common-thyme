import { describe, expect, it } from "vitest";
import { MemoryStore } from "./memory-store";
import { ChefSession } from "./session";
import type { CatalogRecipe } from "./planner";
import type { FetchedPage } from "./fetch-page";

const r = (id: string, useUp: string[], tags: string[] = []): CatalogRecipe => ({ id, title: id[0].toUpperCase() + id.slice(1), tags, totalMinutes: 30, useUp });
const recipes = () => [
  r("piccata", ["parsley", "caper", "chicken"], ["kid friendly"]),
  r("orzo", ["parsley", "caper", "shrimp"]),
  r("pesto", ["parsley", "ricotta", "basil"], ["kid friendly"]),
  r("quesadilla", ["kale", "jack"], ["kid friendly"]),
  r("ramen", ["kale", "shiitake"]),
  r("tacos", ["cilantro", "fish"]),
  r("curry", ["coconut", "spinach"]),
];

// Wednesday, Nov 25 2026
const TODAY = "2026-11-25";

async function setup(fetchPage?: (url: string) => Promise<FetchedPage>, attachment: ConstructorParameters<typeof ChefSession>[2] = null) {
  const store = new MemoryStore(recipes());
  const session = new ChefSession(store, TODAY, attachment, fetchPage);
  await session.load();
  return { store, session };
}
const refOf = (s: ChefSession, id: string) => s.recipeRefFor(id);
const live = (store: MemoryStore) => store.dinnerList.filter((d) => d.status !== "moved").sort((a, b) => a.date.localeCompare(b.date));

describe("plan_week", () => {
  it("drafts next week's nights and says what they share", async () => {
    const { store, session } = await setup();
    const out = await session.planWeekTool({ week_start: "2026-11-30", kid_nights: 1 });
    expect(out.ok).toBe(true);
    expect(out.text).toContain("Use-up ingredients shared across nights: parsley");
    const dinners = live(store);
    expect(dinners.map((d) => d.date)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"]);
    expect(dinners.filter((d) => d.sharedWithKids)).toHaveLength(1);
    expect(dinners.find((d) => d.sharedWithKids)!.servings).toBe(4);
    expect(store.plansList[0]).toMatchObject({ weekStart: "2026-11-30", status: "draft" });
    expect(session.changes).toEqual(["Drafted the week of Nov 30"]);
  });

  it("only fills this week's nights from today on, and leaves cooked dinners alone", async () => {
    const { store, session } = await setup();
    const plan = await store.ensurePlan("2026-11-23");
    const cooked = await store.addDinner({ planId: plan.id, date: "2026-11-23", recipeId: "curry", sharedWithKids: false, servings: 2 });
    await store.updateDinner(cooked.id, { status: "cooked" });
    const out = await session.planWeekTool({ week_start: "2026-11-23", nights: ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"] });
    expect(out.ok).toBe(true);
    const dates = live(store).map((d) => d.date);
    expect(dates).toEqual(["2026-11-23", "2026-11-25", "2026-11-26"]);
    expect(store.dinnerList.find((d) => d.id === cooked.id)!.status).toBe("cooked");
    // The cooked recipe isn't picked again this week.
    expect(live(store).filter((d) => d.recipeId === "curry")).toHaveLength(1);
  });

  it("re-planning some nights leaves the week's other dinners alone", async () => {
    const { store, session } = await setup();
    const plan = await store.ensurePlan("2026-11-30");
    const friday = await store.addDinner({ planId: plan.id, date: "2026-12-04", recipeId: "pesto", sharedWithKids: false, servings: 2 });
    await session.planWeekTool({ week_start: "2026-11-30", nights: ["2026-11-30", "2026-12-01"] });
    const after = live(store);
    expect(after.map((d) => d.date)).toEqual(["2026-11-30", "2026-12-01", "2026-12-04"]);
    expect(after.find((d) => d.date === "2026-12-04")!.id).toBe(friday.id);
    expect(after.filter((d) => d.recipeId === "pesto")).toHaveLength(1);
  });

  it("rejects a week that doesn't start on Monday or is over", async () => {
    const { session } = await setup();
    expect((await session.planWeekTool({ week_start: "2026-11-24" })).ok).toBe(false);
    expect((await session.planWeekTool({ week_start: "2026-11-09" })).ok).toBe(false);
  });
});

describe("changing dinners", () => {
  async function withWeek() {
    const ctx = await setup();
    await ctx.session.planWeekTool({ week_start: "2026-11-23", nights: ["2026-11-25", "2026-11-26", "2026-11-27"] });
    await ctx.session.stateText(true); // hands out dinner refs, as a real turn does
    return ctx;
  }
  const dinnerRef = (s: ChefSession, store: MemoryStore, date: string) => s.dinnerRefFor(live(store).find((d) => d.date === date)!.id);

  it("pushes a dinner to next week and keeps the trail", async () => {
    const { store, session } = await withWeek();
    const old = live(store).find((d) => d.date === "2026-11-26")!;
    const out = await session.moveDinnerTool({ dinner: dinnerRef(session, store, "2026-11-26"), to_date: "2026-12-01" });
    expect(out.ok).toBe(true);
    const moved = store.dinnerList.find((d) => d.id === old.id)!;
    expect(moved.status).toBe("moved");
    const now = store.dinnerList.find((d) => d.id === moved.movedTo)!;
    expect(now).toMatchObject({ date: "2026-12-01", recipeId: old.recipeId, status: "planned" });
    expect(store.plansList.map((p) => p.weekStart)).toContain("2026-11-30");
    expect(session.changes.at(-1)).toMatch(/to Tue, Dec 1$/);
  });

  it("won't double-book a night unless asked to swap", async () => {
    const { store, session } = await withWeek();
    const a = live(store).find((d) => d.date === "2026-11-25")!;
    const b = live(store).find((d) => d.date === "2026-11-26")!;
    const blocked = await session.moveDinnerTool({ dinner: session.dinnerRefFor(a.id), to_date: "2026-11-26" });
    expect(blocked.ok).toBe(false);
    const swapped = await session.moveDinnerTool({ dinner: session.dinnerRefFor(a.id), to_date: "2026-11-26", swap: true });
    expect(swapped.ok).toBe(true);
    const after = live(store);
    expect(after.find((d) => d.date === "2026-11-26")!.recipeId).toBe(a.recipeId);
    expect(after.find((d) => d.date === "2026-11-25")!.recipeId).toBe(b.recipeId);
  });

  it("checks in, swaps recipes and shares with the kids", async () => {
    const { store, session } = await withWeek();
    const ref = dinnerRef(session, store, "2026-11-25");
    expect((await session.markDinnerTool({ dinner: ref, status: "cooked" })).ok).toBe(true);
    expect(live(store)[0].status).toBe("cooked");
    expect((await session.markDinnerTool({ dinner: dinnerRef(session, store, "2026-11-27"), status: "cooked" })).ok).toBe(false); // still ahead

    const tomorrow = dinnerRef(session, store, "2026-11-26");
    const out = await session.changeDinnerTool({ dinner: tomorrow, recipe: refOf(session, "tacos"), shared_with_kids: true });
    expect(out.ok).toBe(true);
    expect(live(store).find((d) => d.date === "2026-11-26")).toMatchObject({ recipeId: "tacos", sharedWithKids: true, servings: 4 });
  });

  it("locks in a week", async () => {
    const { store, session } = await withWeek();
    expect((await session.lockWeekTool({ week_start: "2026-11-23" })).ok).toBe(true);
    expect(store.plansList[0].status).toBe("approved");
  });

  it("explains bad refs instead of throwing", async () => {
    const { session } = await withWeek();
    expect(await session.changeDinnerTool({ dinner: "d99", recipe: "r1" })).toEqual({ ok: false, text: "Unknown dinner ref." });
    expect((await session.addDinnerTool({ date: "2026-11-28", recipe: "r999" })).ok).toBe(false);
    expect((await session.addDinnerTool({ date: "2026-11-20", recipe: "r1" })).text).toContain("past");
  });
});

describe("recipes and notes", () => {
  it("adds a recipe from a link with its photo, and can plan with it at once", async () => {
    const fetchPage = async (): Promise<FetchedPage> => ({
      ok: true,
      url: "https://example.com/soup",
      text: "",
      image: null,
      recipe: { title: "Green Soup", ingredientLines: ["1 bunch kale", "1 lemon"], steps: [{ title: null, body: "Simmer." }], totalMinutes: 20, servings: 4, photoUrl: "https://example.com/soup.jpg", tags: ["soup"] },
    });
    const { store, session } = await setup(fetchPage);
    const out = await session.addRecipeFromLinkTool({ url: "https://example.com/soup", perishable: ["kale", "lemon"] });
    expect(out.ok).toBe(true);
    expect(store.created[0]).toMatchObject({ title: "Green Soup", sourceUrl: "https://example.com/soup", servings: 4, perishable: ["kale", "lemon"], photo: { url: "https://example.com/soup.jpg" } });
    // Lemon is a cheap staple, so only the kale counts.
    expect(session.catalog.at(-1)!.useUp).toEqual(["kale"]);
    expect(out.text).toMatch(/as r8 /);
  });

  it("hands Chef the page text when there's no structured recipe", async () => {
    const { session } = await setup(async () => ({ ok: true, url: "https://blog.example", text: "Grandma's stew: 2 carrots…", image: "https://blog.example/stew.jpg", recipe: null }));
    const out = await session.addRecipeFromLinkTool({ url: "https://blog.example", perishable: [] });
    expect(out.ok).toBe(false);
    expect(out.text).toContain("save_recipe");
    expect(out.text).toContain("Grandma's stew");
  });

  it("saves a recipe read from a photo, with the photo", async () => {
    const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" };
    const { store, session } = await setup(undefined, photo);
    const out = await session.saveRecipeTool({ title: "Card Recipe", ingredients: ["2 eggs"], steps: ["Whisk.", "Cook."], perishable: ["egg"], photo: "attached", tags: ["Breakfast"] });
    expect(out.ok).toBe(true);
    expect(store.created[0]).toMatchObject({ title: "Card Recipe", photo, tags: ["breakfast"], steps: [{ body: "Whisk." }, { body: "Cook." }] });
    expect((await session.saveRecipeTool({ title: "x", ingredients: [], steps: ["a"], perishable: [], photo: "none" })).ok).toBe(false);
  });

  it("remembers and forgets", async () => {
    const { store, session } = await setup();
    await session.rememberTool({ note: "No mushrooms.", category: "tastes", source: "you_said" });
    expect(store.noteList).toEqual([expect.objectContaining({ body: "No mushrooms.", source: "you_said" })]);
    expect((await session.forgetTool({ note: "n1" })).ok).toBe(true);
    expect(store.noteList).toEqual([]);
  });

  it("asks with tap-to-answer choices", async () => {
    const { session } = await setup();
    expect(session.askTool({ question: "How many kid nights?", choices: ["None"] }).ok).toBe(false);
    expect(session.askTool({ question: "How many kid nights?", choices: ["None", "1", "2"] }).ok).toBe(true);
    expect(session.choice).toEqual({ question: "How many kid nights?", choices: ["None", "1", "2"] });
  });

  it("changes an ingredient's tier for every recipe that uses it", async () => {
    const { store, session } = await setup();
    const out = await session.setIngredientTierTool({ ingredient: "Capers", tier: "pantry" });
    expect(out.ok).toBe(true);
    const piccata = session.catalog.find((x) => x.id === "piccata")!;
    expect(piccata.useUp).not.toContain("caper");
    expect(piccata.pantry).toEqual(["capers"]);
    expect((await store.catalog()).find((x) => x.id === "orzo")!.pantry).toEqual(["capers"]);
    // Refs survive the reload.
    expect(session.recipeRefFor("piccata")).toBe("r1");
    expect(session.changes).toContain("Treating capers as nice to share");
    expect((await session.setIngredientTierTool({ ingredient: "saffron", tier: "use_up" })).ok).toBe(false);
    expect((await session.setIngredientTierTool({ ingredient: "kale", tier: "sometimes" })).ok).toBe(false);
  });
});

describe("stock-up items across weeks", () => {
  it("favors finishing walnuts bought for last week", async () => {
    const store = new MemoryStore([
      { ...r("salad", ["arugula"]), stockUp: ["walnut"] },
      { ...r("bread", ["zucchini"]), stockUp: ["walnut"] },
      r("stew", ["carrot"]),
      r("soup", ["leek"]),
    ]);
    const plan = await store.ensurePlan("2026-11-23");
    await store.addDinner({ planId: plan.id, date: "2026-11-24", recipeId: "bread", sharedWithKids: false, servings: 2 });
    const session = new ChefSession(store, TODAY);
    await session.load();
    session.settings = { ...session.settings, dinnersPerWeek: 1, noRepeatWeeks: 1 };
    const out = await session.planWeekTool({ week_start: "2026-11-30", kid_nights: 0 });
    expect(out.text).toContain("Finishes stock-up items bought for recent weeks: walnut.");
    expect(live(store).find((d) => d.date === "2026-11-30")!.recipeId).toBe("salad");
  });
});
