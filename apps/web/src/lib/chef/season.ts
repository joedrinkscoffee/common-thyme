/**
 * Which dinners fit the time of year. A recipe's seasons come from its tags
 * when it has a season tag ("summer", "winter", "year round"), otherwise
 * from words in its title and ingredients: fresh corn and grilling in
 * summer, soups, ramen and braises when it's cold, squash and apples in the
 * fall, asparagus and peas in spring. Northern hemisphere months.
 */
import type { CatalogRecipe } from "./planner";

export type Season = "summer" | "cold" | "fall" | "spring";

/** Months (1-12) each season covers. */
export const SEASON_MONTHS: Record<Season, number[]> = {
  summer: [6, 7, 8, 9],
  cold: [11, 12, 1, 2, 3],
  fall: [9, 10, 11],
  spring: [3, 4, 5],
};

const WORDS: Record<Season, RegExp> = {
  summer:
    /\b(corn(?! tortilla| starch|meal|flake)|elote|esquites|grill(ed)?(?! cheese)|bbq|barbecue|burgers?|zucchini|summer squash|watermelon|peach(es)?|nectarines?|gazpacho|caprese|heirloom tomato(es)?|kebabs?|skewers?|summer)\b/,
  cold: /\b(soups?|ramen|stews?|chili(?!-| oil| crisp| flakes?| paste| sauce| powder| crunch)|braised?|pho|chowder|bisque|pot pie|casserole|shepherd'?s pie|pot roast|goulash|minestrone|cassoulet|winter)\b/,
  fall: /\b(butternut|delicata|acorn squash|pumpkin|sweet potato(es)?|brussels|apples?|pears?|parsnips?|cranberr(y|ies)|fall|autumn)\b/,
  spring: /\b(asparagus|peas|snap peas?|snow peas?|ramps?|fava|rhubarb|morels?|spring pea)\b/,
};

const TAG_SEASON: Record<string, Season | "any"> = {
  summer: "summer",
  grill: "summer",
  grilling: "summer",
  winter: "cold",
  "cold weather": "cold",
  soup: "cold",
  fall: "fall",
  autumn: "fall",
  spring: "spring",
  "year round": "any",
  "year-round": "any",
  "any season": "any",
};

const LABEL: Record<Season, string> = { summer: "summer", cold: "cold weather", fall: "fall", spring: "spring" };

/** The seasons a recipe belongs to; empty means it fits any time of year. */
export function recipeSeasons(r: Pick<CatalogRecipe, "title" | "tags" | "useUp">): Season[] {
  const tagged = r.tags.map((t) => TAG_SEASON[t.toLowerCase().trim()]).filter(Boolean);
  if (tagged.includes("any")) return [];
  if (tagged.length) return [...new Set(tagged as Season[])];
  const text = [r.title, ...r.useUp].join(" | ").toLowerCase();
  // Chilled noodles and cold soups are summer dishes.
  if (/\b(chilled|cold noodles?|cold soba)\b/.test(text)) return ["summer"];
  return (Object.keys(WORDS) as Season[]).filter((s) => WORDS[s].test(text));
}

export function inSeason(seasons: Season[], month: number): boolean {
  return seasons.some((s) => SEASON_MONTHS[s].includes(month));
}

/**
 * How well a recipe fits the month: +2 in season, -4 out of season, 0 for
 * dishes that fit any time. One shared use-up ingredient earns 3, so an
 * out-of-season dish needs real overlap to make the week.
 */
export function seasonFit(r: Pick<CatalogRecipe, "title" | "tags" | "useUp">, month: number): number {
  const seasons = recipeSeasons(r);
  if (!seasons.length) return 0;
  return inSeason(seasons, month) ? 2 : -4;
}

export function seasonLabel(seasons: Season[]): string {
  return seasons.map((s) => LABEL[s]).join(", ");
}

/** The month a week mostly falls in (its Thursday). */
export function monthOfWeek(weekStart: string): number {
  const [y, m, d] = weekStart.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 3)).getUTCMonth() + 1;
}

/** One line for Chef on what fits this time of year. */
export function seasonText(month: number): string {
  const now = (Object.keys(SEASON_MONTHS) as Season[]).filter((s) => SEASON_MONTHS[s].includes(month));
  const out = (Object.keys(SEASON_MONTHS) as Season[]).filter((s) => !now.includes(s));
  const examples: Record<Season, string> = {
    summer: "fresh corn, grilling, burgers, tomatoes, zucchini",
    cold: "soups, ramen, stews, chili, braises",
    fall: "squash, pumpkin, sweet potato, Brussels sprouts, apples",
    spring: "asparagus, peas, rhubarb",
  };
  return `In season now: ${now.map((s) => `${LABEL[s]} (${examples[s]})`).join("; ")}. Out of season: ${out.map((s) => `${LABEL[s]} (${examples[s]})`).join("; ")}.`;
}
