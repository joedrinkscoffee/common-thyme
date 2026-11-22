/**
 * The Chef home with made-up data, shown when Supabase isn't configured
 * (local previews). Uses the real planner and brief so it looks like the app.
 */
import { addDays, hourIn, isIsoDate, todayIn, weekDates, weekStartOf } from "./dates";
import { buildHome, type ChefHomeData, type HomeMessage } from "./home";
import { MemoryStore } from "./memory-store";
import { ensureDrafts } from "./auto-draft";
import { planWeek, type CatalogRecipe } from "./planner";
import { sampleRecipes } from "../sample-recipes";

// What each sample recipe shares, already sorted into tiers.
const TIERS: Record<string, { useUp: string[]; pantry?: string[]; stockUp?: string[] }> = {
  "Chicken Piccata": { useUp: ["chicken breast"], pantry: ["caper"] },
  "Calabrian Shrimp & Orzo": { useUp: ["shrimp", "spinach"], pantry: ["caper", "calabrian chile paste"] },
  "Kale & Jack Quesadillas": { useUp: ["kale", "scallion"], pantry: ["monterey jack", "flour tortilla"] },
  "Pesto Pasta & Lemon Ricotta": { useUp: ["pesto", "ricotta", "spinach"], stockUp: ["pine nut"] },
  "Feta & Olive Pizza": { useUp: ["feta", "kale"], pantry: ["pizza dough", "olive"] },
  "Miso & Shiitake Ramen": { useUp: ["shiitake", "scallion", "miso"] },
  "Spicy Veracruz-Style Shrimp": { useUp: ["shrimp", "tomato", "cilantro"], pantry: ["olive", "caper"] },
  "Cheddar & Spicy Red Onion Burgers": { useUp: ["ground beef"], pantry: ["cheddar"] },
};
const KID_FRIENDLY = new Set(["Chicken Piccata", "Kale & Jack Quesadillas", "Pesto Pasta & Lemon Ricotta", "Cheddar & Spicy Red Onion Burgers"]);

export async function sampleHome(dayParam?: string): Promise<ChefHomeData> {
  const today = isIsoDate(dayParam) ? dayParam : todayIn("America/New_York");
  const catalog: CatalogRecipe[] = sampleRecipes.map((r) => ({
    id: r.id,
    title: r.title,
    tags: KID_FRIENDLY.has(r.title) ? [...r.tags.filter((t) => t !== "kid friendly"), "kid friendly"] : r.tags,
    totalMinutes: r.totalMinutes,
    useUp: TIERS[r.title]?.useUp ?? [],
    pantry: TIERS[r.title]?.pantry ?? [],
    stockUp: TIERS[r.title]?.stockUp ?? [],
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

  // Like the real home: Chef drafts an empty week and says so.
  const drafts = await ensureDrafts({ store, today, hasDrafted: async () => false });
  for (const d of drafts) {
    messages.push({ id: `auto-${d.weekStart}`, role: "chef", author: null, body: d.body, choice: d.choice, changes: d.changes, at: `${today}T15:00:00Z` });
  }

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
