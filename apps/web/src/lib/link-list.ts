/**
 * Turns what people paste or upload into a list of links to import: a block
 * of text with links in it, or the bookmarks file a desktop browser exports
 * (Chrome, Safari, Firefox and Edge all write the same HTML format).
 */
import { decodeEntities } from "./chef/recipe-page";

export type FoundLink = {
  url: string;
  title: string;
  /** The bookmark folder it was in ("Recipes › Soups"), or "" for pasted links. */
  folder: string;
  /** A guess used to pre-tick the box; people can change it. */
  recipe: boolean;
};

/** Most a single run will import, to keep a run (and its cost) bounded. */
export const MAX_LINKS_PER_RUN = 150;

const RECIPE_SITES = [
  "allrecipes.com", "americastestkitchen.com", "bbcgoodfood.com", "bonappetit.com", "budgetbytes.com", "blueapron.com",
  "cookieandkate.com", "cooking.nytimes.com", "cooksillustrated.com", "damndelicious.net", "delish.com", "eatingwell.com",
  "epicurious.com", "food.com", "food52.com", "foodnetwork.com", "halfbakedharvest.com", "hellofresh.com", "justonecookbook.com",
  "kingarthurbaking.com", "loveandlemons.com", "minimalistbaker.com", "pinchofyum.com", "recipetineats.com", "sallysbakingaddiction.com",
  "seriouseats.com", "simplyrecipes.com", "skinnytaste.com", "smittenkitchen.com", "tasty.co", "thekitchn.com", "thewoksoflife.com",
  "marthastewart.com", "foodandwine.com", "davidlebovitz.com", "101cookbooks.com", "feastingathome.com",
];

const RECIPE_WORDS = /\b(recipes?|cook(ing)?|bake[sd]?|baking|dinner|soup|salad|pasta|curry|stew|chicken|tacos?|noodles?|roast(ed)?|braised?)\b/i;

function normalise(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    // Tracking tags make the same page look like two links.
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_|ref$)/i.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return null;
  }
}

export function looksLikeRecipe(url: string, title: string): boolean {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = decodeURIComponent(u.pathname).replace(/[-_/]+/g, " ");
  } catch {
    return false;
  }
  if (RECIPE_SITES.some((s) => host === s || host.endsWith(`.${s}`))) return true;
  return RECIPE_WORDS.test(path) || RECIPE_WORDS.test(title);
}

function addTo(out: FoundLink[], seen: Set<string>, raw: string, title: string, folder: string) {
  const url = normalise(raw);
  if (!url || seen.has(url)) return;
  seen.add(url);
  out.push({ url, title: title || url, folder, recipe: looksLikeRecipe(url, title) });
}

/** Every link in pasted text, in order, without repeats. */
export function linksFromText(text: string): FoundLink[] {
  const out: FoundLink[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"'`]+/gi)) {
    // Sentences end in punctuation that isn't part of the link.
    const raw = m[0].replace(/[),.;:!?\]]+$/, "");
    addTo(out, seen, raw, "", "");
  }
  return out.map((l) => ({ ...l, recipe: true }));
}

/** Every bookmark in a browser's exported bookmarks file, with its folder. */
export function linksFromBookmarks(html: string): FoundLink[] {
  const out: FoundLink[] = [];
  const seen = new Set<string>();
  const folders: string[] = [];
  let pending: string | null = null;
  const token = /<h3[^>]*>([\s\S]*?)<\/h3>|<dl[\s>]|<\/dl>|<a\s[^>]*?href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(token)) {
    const tag = m[0].slice(0, 3).toLowerCase();
    if (m[1] !== undefined) {
      pending = decodeEntities(m[1].replace(/<[^>]*>/g, "")).trim();
    } else if (tag === "<dl") {
      folders.push(pending ?? "");
      pending = null;
    } else if (tag === "</d") {
      folders.pop();
    } else if (m[2] !== undefined) {
      const title = decodeEntities(m[3].replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
      // Browsers wrap everything in "Bookmarks bar" and the like; skip that level.
      const path = folders.filter(Boolean).slice(1);
      addTo(out, seen, decodeEntities(m[2]), title, path.join(" › ") || folders.filter(Boolean)[0] || "");
    }
  }
  return out;
}

/** Groups links by folder, keeping the order folders first appear in. */
export function byFolder(links: FoundLink[]): { folder: string; links: FoundLink[] }[] {
  const groups = new Map<string, FoundLink[]>();
  for (const l of links) {
    const list = groups.get(l.folder) ?? [];
    list.push(l);
    groups.set(l.folder, list);
  }
  return [...groups].map(([folder, list]) => ({ folder, links: list }));
}
