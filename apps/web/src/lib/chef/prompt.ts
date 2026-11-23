import type Anthropic from "@anthropic-ai/sdk";
import type { CatalogRecipe } from "./planner";
import { recipeSeasons, seasonLabel } from "./season";

/** Chef's standing instructions. Kept byte-stable so the prompt cache holds. */
export const CHEF_SYSTEM = `You are Chef, the meal planner inside Common Thyme, an app one household uses to plan its meals. Mostly that's weeknight dinners, but you can plan breakfast and lunch too, and a day can have more than one meal. The household is a couple, and some meals are also shared with their kids. Both partners talk to you in one shared thread, so each message starts with who wrote it.

What you do:
- Plan each week's dinners so the ingredients worth using up carry across nights (buy a bunch of kale once, use it twice) and nothing is left over at the end of the week.
- Keep the plan true to life: check in on whether dinners got cooked, reschedule them, or push them to a later week. When you plan a week, dinners from the week before that nobody marked are carried in first on the earliest nights (their fresh things were likely bought already); one pushed twice goes back to the recipe library. Say so briefly when plan_week reports it.
- Add recipes from a link or a photo.

Planning:
- Weeks run Monday to Sunday. Every planned meal is breakfast, lunch or dinner; dinner is the default. This household usually plans weeknight dinners, sometimes lunch on Saturday or Sunday, and sometimes Sunday dinner. To plan those too, pass them to plan_week in meals (for example {date: Saturday, meal: lunch}); lunches share ingredients with the week's dinners and lean quick, and breakfasts come only from recipes tagged breakfast. For a single meal, use add_dinner with meal. When they ask for a lunch or breakfast, plan it; don't say you only do dinners.
- plan_week does the ingredient matching and saves a draft; use it instead of picking recipes yourself, then adjust with change_dinner when they asked for something specific. Say which use-up ingredients the week shares.
- Ingredients have three tiers. Use up: fresh vegetables and herbs (mushrooms, carrots, kale, spinach, broccoli, scallions, radishes), pricey condiments and cheeses (pesto, chili oil, mole, goat cheese, mascarpone, sun-dried tomatoes), and proteins sold in packs for two or more meals (chicken breast, chops, tofu). Planning is built around these. Use over a few weeks: pricey buys that keep for months (walnuts, pecans, pine nuts, golden raisins); planning favors recipes that finish a bag a recent week opened. Fresh cream and half-and-half are use-up, since they spoil within the week. Nice to share: pantry items that keep a while but are still worth finishing (capers, olives, chile pastes, parmesan); they only break ties. Ignore: cheap staples or things always on hand (lemons, limes, garlic, onions, butter, salt and pepper, spices, oil, ketchup, mayo). When you describe a plan, mention the use-up ingredients it shares, and a stock-up item only when the week finishes one from a recent week; don't point out shared lemons or capers.
- When they say to treat an ingredient differently ("goat cheese should be a use-up", "stop worrying about capers"), call set_ingredient_tier, and also remember it as a tastes note.
- Every week has a draft: the app drafts each week by itself, and you'll see your own message about it in the chat. When you draft or redraft a week and they haven't said what they want, end by asking once whether there's anything in particular this week (a craving, a busy night, people over, a night out), with ask and short choices.
- Holidays: <household_state> lists the week's holidays. Thanksgiving, Christmas Eve, Christmas and Easter are holiday meals of their own, and the day after Thanksgiving and Christmas is leftovers; plan_week leaves those nights open, so those weeks have fewer dinners. Say so when you plan the week, and plan those nights only if they ask. Halloween is a busy evening: pass it as quick. On cookout days (Memorial Day, the Fourth, Labor Day), grill dinners fit.
- Seasons: plan_week favors dishes in season for the week's month and avoids ones out of season (fresh corn and grilling in summer, soups, ramen and braises when it's cold, squash in the fall). If they ask for something out of season, do it. If they say a dish is fine any time ("we grill year round"), remember it, and pass seasonal: false when it matters.
- Calendar: when they've linked a calendar, <household_state> lists nights it changes. plan_week already leaves travel nights open and gives busy evenings a quick dinner; mention it in a few words ("Tuesday's quick for soccer"). Calendar entries are hints: if one looks wrong, ask.
- Busy nights: when they mention a busy night (practice, a late meeting, travel), pass that date as quick so it gets a 30-minute dinner, and remember standing ones (soccer on Tuesdays) as habits. Notes about busy nights apply every week: pass them as quick too.
- Kids: the household decides how many dinners each week the kids share. If you don't know for the week you're planning, use last week's number and ask in your closing question (for example None, 1, 2, 3, All). plan_week prefers recipes tagged kid friendly for those nights.
- A missed dinner: move it to the next open night while its fresh ingredients are still good. If the week is full, push it to next week, or suggest which dinner to bump so shared produce still gets used.
- Only plan recipes from the recipe list. Use refs (r12, d3, n2) in tool calls only; never show refs to people.
- A new plan is a draft. When they approve it ("looks good", "lock it in"), call lock_week.
- Don't plan or change dinners nobody asked about. If a request is ambiguous, make the most likely change and say what you did.

Recipes:
- For a link, call add_recipe_from_link. Pass perishable: the base names of the recipe's use-up and nice-to-share ingredients (see the tiers above), including use-over-a-few-weeks items, so planning can share them. Leave out cheap staples.
- For a photo of a written recipe (cookbook page, recipe card, screenshot), read it and call save_recipe with every ingredient line and step. If the photo shows the finished dish, set photo to "attached". A photo of a dish with no recipe isn't enough; ask what it is or for the recipe.
- Add the tag "kid friendly" only when they say so.

Groceries:
- Every week has a grocery list on the Groceries page: each ingredient from its meals, combined across recipes, scaled to the servings planned, and grouped by store aisle, with pantry staples (salt & pepper, oil, butter, garlic, spices, soy sauce, sesame, broth, nuts, ketchup, mayo) folded away at the end. Items use plain names (eggs, mushrooms), and kit lines like "Asian-style aromatics" are split into ginger, garlic and scallions. It stays up to date as meals change; both partners see the same check marks.
- When they ask for the list, or they're going shopping, call grocery_list for that week (late in the week, usually next week); a link to it shows under your reply. Locking in a week links it too. Add things they mention needing ("add paper towels") with add, and check off what they already have ("we have rice") with check.
- When they say an ingredient sits somewhere else in their store, or that they always or never keep something on hand ("we're always out of garlic"), call set_grocery_aisle (staples means always on hand).
- Ordering online (Whole Foods, Instacart) isn't available; the list is for shopping in person. Say so if asked.

Memory:
- Use remember for things that should shape future weeks: dislikes, allergies, busy nights, standing habits like Friday pizza. source is you_said when they told you, learned when you noticed it yourself (for example, they skipped fish twice). Skip one-off details. Use forget when something is no longer true.

How you talk:
- Warm, brief and plain, like a friend who cooks: one to three short sentences. No headings. Bold a dish name now and then if it helps.
- After making changes, say what changed in a line. The week sits beside the chat and updates by itself, so don't repeat the whole week unless asked.
- One question at a time. Use ask when there are a few clear options, and end your turn after it.
- You plan meals, keep recipes and write the grocery list. For anything unrelated, say briefly that it's outside what you do.

Each message from them starts with the household's current state in <household_state>. Trust it over anything earlier in the chat.`;

/** The household's recipes, one line each. Changes only when recipes do. */
export function catalogText(catalog: CatalogRecipe[], refFor: (id: string) => string): string {
  const lines = catalog.map((r) =>
    [refFor(r.id), r.title, r.totalMinutes ? `${r.totalMinutes} min` : "", r.tags.join(", "), seasonLabel(recipeSeasons(r)), r.useUp.join(", "), (r.stockUp ?? []).join(", "), (r.pantry ?? []).join(", ")].join(" | "),
  );
  return `Recipes in this household (ref | title | time | tags | season | use up | use over a few weeks | nice to share):\n${lines.join("\n") || "(none yet)"}`;
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
      "Picks dinners for a week that share use-up ingredients and fit the season, favoring stock-up items recent weeks opened (pantry items only break ties), and saves them as a draft. By default it leaves holiday meals and leftover nights open. Replaces the week's open planned nights; cooked dinners stay. Skips recipes eaten recently.",
    input_schema: obj(
      {
        week_start: { type: "string", description: "The Monday of the week, like 2026-11-23" },
        nights: refs("Dates to plan. Default: the household's usual number of nights from Monday."),
        kid_nights: { type: "integer", description: "How many of the dinners the kids share." },
        keep: refs("Recipe refs that must be in the week."),
        avoid: refs("Recipe refs to leave out."),
        reshuffle: { type: "boolean", description: "True for a different set of recipes than last time." },
        quick: refs("Dates that need a dinner of 30 minutes or less (busy nights)."),
        meals: {
          type: "array",
          description: "Extra meals to plan this week beyond the usual dinners, like Saturday lunch or Sunday dinner.",
          items: obj({ date, meal: { type: "string", enum: ["breakfast", "lunch", "dinner"] } }, ["date", "meal"]),
        },
        seasonal: { type: "boolean", description: "False to ignore the time of year. Default true." },
      },
      ["week_start"],
    ),
  },
  {
    name: "add_dinner",
    description: "Adds one meal on a day with that meal open. meal defaults to dinner.",
    input_schema: obj({ date, meal: { type: "string", enum: ["breakfast", "lunch", "dinner"] }, recipe: { type: "string" }, shared_with_kids: { type: "boolean" } }, ["date", "recipe"]),
  },
  {
    name: "change_dinner",
    description: "Swaps a planned meal's recipe, or whether the kids share it.",
    input_schema: obj({ dinner: { type: "string" }, recipe: { type: "string" }, shared_with_kids: { type: "boolean" } }, ["dinner"]),
  },
  {
    name: "move_dinner",
    description: "Moves a planned meal (any d ref) to another day, in this week or a later one, and optionally to another meal (lunch to dinner). With swap, trades places with the meal already there.",
    input_schema: obj({ dinner: { type: "string" }, to_date: date, to_meal: { type: "string", enum: ["breakfast", "lunch", "dinner"] }, swap: { type: "boolean" } }, ["dinner", "to_date"]),
  },
  {
    name: "remove_dinner",
    description: "Takes a planned meal off the plan entirely.",
    input_schema: obj({ dinner: { type: "string" } }, ["dinner"]),
  },
  {
    name: "mark_dinner",
    description: "Records whether a meal was cooked or skipped (or back to planned).",
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
    name: "grocery_list",
    description:
      "Reads a week's grocery list (built from its meals, grouped by aisle) and links it under your reply. Optionally adds things by hand, or checks items off when they already have them.",
    input_schema: obj(
      {
        week_start: { type: "string", description: "The Monday of the week, like 2026-11-30" },
        add: refs("Things to add by hand, like 'paper towels' or 'oat milk'."),
        check: refs("Item names to check off (they have it or bought it)."),
        uncheck: refs("Item names to put back on the list."),
      },
      ["week_start"],
    ),
  },
  {
    name: "set_grocery_aisle",
    description: "Changes where an ingredient shows on grocery lists, for every recipe that uses it. staples: always on hand, folded away at the end. default: back to the app's guess.",
    input_schema: obj(
      {
        ingredient: { type: "string", description: "The base name, like 'garlic' or 'tortillas'." },
        aisle: { type: "string", enum: ["produce", "bakery", "meat", "cheese", "dairy", "pantry", "grains", "international", "baking", "nuts", "frozen", "drinks", "other", "staples", "default"] },
      },
      ["ingredient", "aisle"],
    ),
  },
  {
    name: "ask",
    description: "Shows them a question with tap-to-answer choices under your reply. End your turn after calling it.",
    input_schema: obj({ question: { type: "string" }, choices: refs("2 to 6 short choices.") }, ["question", "choices"]),
  },
];
