/**
 * The Chef home with made-up data, shown when Supabase isn't configured
 * (local previews). Uses the real planner and brief so it looks like the app.
 */
import { addDays, hourIn, isIsoDate, todayIn, weekDates, weekStartOf } from "./dates";
import { buildHome, type ChefHomeData, type HomeMessage } from "./home";
import { MemoryStore } from "./memory-store";
import { planWeek, type CatalogRecipe } from "./planner";
import { sampleRecipes } from "../sample-recipes";

const PERISHABLES: Record<string, string[]> = {
  "Chicken Piccata": ["lemon", "caper", "chicken cutlet"],
  "Calabrian Shrimp & Orzo": ["shrimp", "lemon", "caper", "parsley"],
  "Kale & Jack Quesadillas": ["kale", "monterey jack", "scallion"],
  "Pesto Pasta & Lemon Ricotta": ["lemon", "ricotta", "basil"],
  "Feta & Olive Pizza": ["feta", "pizza dough", "kale"],
  "Miso & Shiitake Ramen": ["shiitake", "scallion", "kale"],
  "Spicy Veracruz-Style Shrimp": ["shrimp", "tomato", "cilantro"],
  "Cheddar & Spicy Red Onion Burgers": ["ground beef", "red onion", "cheddar"],
};
const KID_FRIENDLY = new Set(["Chicken Piccata", "Kale & Jack Quesadillas", "Pesto Pasta & Lemon Ricotta", "Cheddar & Spicy Red Onion Burgers"]);

export async function sampleHome(dayParam?: string): Promise<ChefHomeData> {
  const today = isIsoDate(dayParam) ? dayParam : todayIn("America/New_York");
  const catalog: CatalogRecipe[] = sampleRecipes.map((r) => ({
    id: r.id,
    title: r.title,
    tags: KID_FRIENDLY.has(r.title) ? [...r.tags.filter((t) => t !== "kid friendly"), "kid friendly"] : r.tags,
    totalMinutes: r.totalMinutes,
    perishables: PERISHABLES[r.title] ?? [],
  }));
  const store = new MemoryStore(catalog);
  const thisWeek = weekStartOf(today);

  const plan = await store.ensurePlan(thisWeek);
  await store.setPlanStatus(plan.id, "approved");
  const week = planWeek({ catalog, dates: weekDates(thisWeek).slice(0, 5), kidNights: 2, seed: 3 });
  const pastNights = week.nights.filter((n) => n.date < today);
  for (const n of week.nights) {
    const d = await store.addDinner({ planId: plan.id, date: n.date, recipeId: n.recipeId, sharedWithKids: n.sharedWithKids, servings: n.sharedWithKids ? 4 : 2 });
    // Everything before the last past night was cooked; the last one is waiting for a check-in.
    if (n.date < today && n !== pastNights.at(-1)) await store.updateDinner(d.id, { status: "cooked" });
  }

  const sunday = `${addDays(thisWeek, -1)}T15:00:00Z`;
  const messages: HomeMessage[] = [
    { id: "s1", role: "user", author: "Joe", body: "Plan this week. The kids are with us two nights.", choice: null, changes: [], at: sunday },
    {
      id: "s2",
      role: "chef",
      author: null,
      body: `Done. Five dinners built around **${week.shared[0]?.name ?? "lemon"}** and **${week.shared[1]?.name ?? "kale"}**, and the two kid nights are ones they'll eat.`,
      choice: null,
      changes: ["Drafted the week", "Locked it in"],
      at: sunday,
    },
  ];

  return buildHome({
    store,
    today,
    hour: isIsoDate(dayParam) ? 18 : hourIn("America/New_York"),
    firstName: "Joe",
    connected: false,
    messages,
    photoUrls: async () => new Map(),
  });
}
