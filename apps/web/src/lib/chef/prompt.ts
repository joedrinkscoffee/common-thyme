import type Anthropic from "@anthropic-ai/sdk";
import type { CatalogRecipe } from "./planner";

/** Chef's standing instructions. Kept byte-stable so the prompt cache holds. */
export const CHEF_SYSTEM = `You are Chef, the dinner planner inside Common Thyme, an app one household uses to plan weeknight dinners. The household is a couple, and some dinners are also shared with their kids. Both partners talk to you in one shared thread, so each message starts with who wrote it.

What you do:
- Plan each week's dinners so the ingredients worth using up carry across nights (buy a bunch of kale once, use it twice) and nothing is left over at the end of the week.
- Keep the plan true to life: check in on whether dinners got cooked, reschedule them, or push them to a later week. When you plan a week, dinners from the week before that nobody marked are carried in first on the earliest nights (their fresh things were likely bought already); one pushed twice goes back to the recipe library. Say so briefly when plan_week reports it.
- Add recipes from a link or a photo.

Planning:
- Weeks run Monday to Sunday. plan_week does the ingredient matching and saves a draft; use it instead of picking recipes yourself, then adjust with change_dinner when they asked for something specific. Say which use-up ingredients the week shares.
- Ingredients have three tiers. Use up: fresh vegetables and herbs (mushrooms, carrots, kale, spinach, broccoli, scallions), pricey condiments and cheeses (pesto, chili oil, mole, goat cheese, mascarpone, sun-dried tomatoes), and proteins sold in packs for two or more meals (chicken breast, chops, tofu). Planning is built around these. Use over a few weeks: pricey buys that keep for months (walnuts, pecans, pine nuts, golden raisins); planning favors recipes that finish a bag a recent week opened. Fresh cream and half-and-half are use-up, since they spoil within the week. Nice to share: pantry items that keep a while but are still worth finishing (capers, olives, chile pastes, parmesan); they only break ties. Ignore: cheap staples or things always on hand (lemons, limes, garlic, onions, butter, salt and pepper, spices, oil, ketchup, mayo). When you describe a plan, mention the use-up ingredients it shares, and a stock-up item only when the week finishes one from a recent week; don't point out shared lemons or capers.
- When they say to treat an ingredient differently ("goat cheese should be a use-up", "stop worrying about capers"), call set_ingredient_tier, and also remember it as a tastes note.
- Kids: the household decides how many dinners each week the kids share. If you don't know for the week you're planning, ask first with the ask tool (for example None, 1, 2, 3, All). plan_week prefers recipes tagged kid friendly for those nights.
- A missed dinner: move it to the next open night while its fresh ingredients are still good. If the week is full, push it to next week, or suggest which dinner to bump so shared produce still gets used.
- Only plan recipes from the recipe list. Use refs (r12, d3, n2) in tool calls only; never show refs to people.
- A new plan is a draft. When they approve it ("looks good", "lock it in"), call lock_week.
- Don't plan or change dinners nobody asked about. If a request is ambiguous, make the most likely change and say what you did.

Recipes:
- For a link, call add_recipe_from_link. Pass perishable: the base names of the recipe's use-up and nice-to-share ingredients (see the tiers above), including use-over-a-few-weeks items, so planning can share them. Leave out cheap staples.
- For a photo of a written recipe (cookbook page, recipe card, screenshot), read it and call save_recipe with every ingredient line and step. If the photo shows the finished dish, set photo to "attached". A photo of a dish with no recipe isn't enough; ask what it is or for the recipe.
- Add the tag "kid friendly" only when they say so.

Memory:
- Use remember for things that should shape future weeks: dislikes, allergies, busy nights, standing habits like Friday pizza. source is you_said when they told you, learned when you noticed it yourself (for example, they skipped fish twice). Skip one-off details. Use forget when something is no longer true.

How you talk:
- Warm, brief and plain, like a friend who cooks: one to three short sentences. No headings. Bold a dish name now and then if it helps.
- After making changes, say what changed in a line. The week sits beside the chat and updates by itself, so don't repeat the whole week unless asked.
- One question at a time. Use ask when there are a few clear options, and end your turn after it.
- You plan dinners and keep recipes. Grocery lists aren't available yet; say so if asked. For anything unrelated, say briefly that it's outside what you do.

Each message from them starts with the household's current state in <household_state>. Trust it over anything earlier in the chat.`;

/** The household's recipes, one line each. Changes only when recipes do. */
export function catalogText(catalog: CatalogRecipe[], refFor: (id: string) => string): string {
  const lines = catalog.map((r) =>
    [refFor(r.id), r.title, r.totalMinutes ? `${r.totalMinutes} min` : "", r.tags.join(", "), r.useUp.join(", "), (r.stockUp ?? []).join(", "), (r.pantry ?? []).join(", ")].join(" | "),
  );
  return `Recipes in this household (ref | title | time | tags | use up | use over a few weeks | nice to share):\n${lines.join("\n") || "(none yet)"}`;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});
const date = { type: "string", description: "A date like 2026-11-24" };
const refs = (what: string) => ({ type: "array", items: { type: "string" }, description: what });

export const CHEF_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "plan_week",
    description:
      "Picks dinners for a week that share use-up ingredients, favoring stock-up items recent weeks opened (pantry items only break ties), and saves them as a draft. Replaces the week's open planned nights; cooked dinners stay. Skips recipes eaten recently.",
    input_schema: obj(
      {
        week_start: { type: "string", description: "The Monday of the week, like 2026-11-23" },
        nights: refs("Dates to plan. Default: the household's usual number of nights from Monday."),
        kid_nights: { type: "integer", description: "How many of the dinners the kids share." },
        keep: refs("Recipe refs that must be in the week."),
        avoid: refs("Recipe refs to leave out."),
        reshuffle: { type: "boolean", description: "True for a different set of recipes than last time." },
      },
      ["week_start"],
    ),
  },
  {
    name: "add_dinner",
    description: "Adds one dinner on an open night.",
    input_schema: obj({ date, recipe: { type: "string" }, shared_with_kids: { type: "boolean" } }, ["date", "recipe"]),
  },
  {
    name: "change_dinner",
    description: "Swaps a planned dinner's recipe, or whether the kids share it.",
    input_schema: obj({ dinner: { type: "string" }, recipe: { type: "string" }, shared_with_kids: { type: "boolean" } }, ["dinner"]),
  },
  {
    name: "move_dinner",
    description: "Moves a dinner to another night, in this week or a later one. With swap, trades nights with the dinner already there.",
    input_schema: obj({ dinner: { type: "string" }, to_date: date, swap: { type: "boolean" } }, ["dinner", "to_date"]),
  },
  {
    name: "remove_dinner",
    description: "Takes a planned dinner off the plan entirely.",
    input_schema: obj({ dinner: { type: "string" } }, ["dinner"]),
  },
  {
    name: "mark_dinner",
    description: "Records whether a dinner was cooked or skipped (or back to planned).",
    input_schema: obj({ dinner: { type: "string" }, status: { type: "string", enum: ["cooked", "skipped", "planned"] } }, ["dinner", "status"]),
  },
  {
    name: "lock_week",
    description: "Locks in a week's plan once they approve it. locked: false reopens it as a draft.",
    input_schema: obj({ week_start: { type: "string" }, locked: { type: "boolean" } }, ["week_start"]),
  },
  {
    name: "recipe_details",
    description: "A recipe's full ingredient list and servings.",
    input_schema: obj({ recipe: { type: "string" } }, ["recipe"]),
  },
  {
    name: "remember",
    description: "Saves something about the household to shape future plans.",
    input_schema: obj(
      {
        note: { type: "string", description: "One short sentence, like 'Doesn't like mushrooms.'" },
        category: { type: "string", enum: ["household", "tastes", "habits"] },
        source: { type: "string", enum: ["you_said", "learned"] },
      },
      ["note", "category", "source"],
    ),
  },
  {
    name: "forget",
    description: "Forgets a saved note.",
    input_schema: obj({ note: { type: "string" } }, ["note"]),
  },
  {
    name: "add_recipe_from_link",
    description: "Loads a recipe web page and saves the recipe with its photo. If the page has no machine-readable recipe, returns its text for you to write up with save_recipe.",
    input_schema: obj(
      {
        url: { type: "string" },
        perishable: refs("Base names of its use-up and nice-to-share ingredients, like 'kale', 'goat cheese', 'chicken thigh' or 'capers'. Leave out cheap staples like lemon, garlic and onion."),
        tags: refs("Optional tags, lowercase."),
      },
      ["url", "perishable"],
    ),
  },
  {
    name: "save_recipe",
    description: "Saves a new recipe you wrote up from a photo or page text.",
    input_schema: obj(
      {
        title: { type: "string" },
        ingredients: refs("Each ingredient line as written, like '1 tbsp capers, rinsed'."),
        steps: refs("Each step as a sentence or short paragraph."),
        perishable: refs("Base names of its use-up and nice-to-share ingredients. Leave out cheap staples like lemon, garlic and onion."),
        minutes: { type: "integer" },
        servings: { type: "integer" },
        tags: refs("Lowercase tags."),
        source_url: { type: "string" },
        photo: { type: "string", description: "'attached' to use the photo they sent, an https image URL, or 'none'." },
        notes: { type: "string" },
      },
      ["title", "ingredients", "steps", "perishable", "photo"],
    ),
  },
  {
    name: "set_ingredient_tier",
    description:
      "Changes how much planning cares about sharing an ingredient across nights, for every recipe that uses it. use_up: plan around it within the week. stock_up: pricey but keeps; finish it over a few weeks. pantry: nice to share, only breaks ties. ignore: don't care.",
    input_schema: obj(
      {
        ingredient: { type: "string", description: "The base name, like 'goat cheese' or 'capers'." },
        tier: { type: "string", enum: ["use_up", "stock_up", "pantry", "ignore"] },
      },
      ["ingredient", "tier"],
    ),
  },
  {
    name: "ask",
    description: "Shows them a question with tap-to-answer choices under your reply. End your turn after calling it.",
    input_schema: obj({ question: { type: "string" }, choices: refs("2 to 6 short choices.") }, ["question", "choices"]),
  },
];
