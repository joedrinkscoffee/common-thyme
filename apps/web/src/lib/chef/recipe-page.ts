/**
 * Reads a recipe web page. Most recipe sites publish the recipe as
 * schema.org JSON-LD for search engines; when one doesn't, Chef gets the
 * page's text and writes the recipe up itself.
 */

export type PageRecipe = {
  title: string;
  ingredientLines: string[];
  steps: { title: string | null; body: string }[];
  totalMinutes: number | null;
  servings: number | null;
  photoUrl: string | null;
  tags: string[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", frac12: "½", frac14: "¼", frac34: "¾", deg: "°" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const clean = (v: unknown): string =>
  typeof v === "string" ? decodeEntities(v.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() : "";

/** "PT1H30M" → 90 */
export function isoMinutes(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 && total <= 600 ? total : null;
}

function servingsFrom(v: unknown): number | null {
  const first = Array.isArray(v) ? v[0] : v;
  const n = typeof first === "number" ? first : Number(String(first ?? "").match(/\d+/)?.[0]);
  return Number.isInteger(n) && n >= 1 && n <= 24 ? n : null;
}

function imageFrom(v: unknown): string | null {
  const first = Array.isArray(v) ? v[0] : v;
  const url = typeof first === "string" ? first : typeof first === "object" && first ? (first as { url?: unknown }).url : null;
  return typeof url === "string" && /^https:\/\//i.test(url) ? url : null;
}

function stepsFrom(v: unknown): { title: string | null; body: string }[] {
  const out: { title: string | null; body: string }[] = [];
  const walk = (item: unknown, section: string | null) => {
    if (typeof item === "string") {
      // One big string: split on line breaks, or keep as one step.
      for (const part of item.split(/\n+|<br\s*\/?>/i)) {
        const body = clean(part);
        if (body) out.push({ title: null, body });
      }
      return;
    }
    if (Array.isArray(item)) return item.forEach((i) => walk(i, section));
    if (!item || typeof item !== "object") return;
    const o = item as Record<string, unknown>;
    const type = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    if (type.includes("HowToSection")) return walk(o.itemListElement, clean(o.name) || null);
    const body = clean(o.text ?? o.description ?? o.name);
    if (!body) return;
    const name = clean(o.name);
    const title = name && name !== body && !body.startsWith(name) ? name : section;
    out.push({ title: title || null, body });
    section = null;
  };
  walk(v, null);
  return out.slice(0, 40);
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipe(n, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const o = node as Record<string, unknown>;
  const type = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
  if (type.includes("Recipe")) return o;
  return findRecipe(o["@graph"], depth + 1) ?? findRecipe(o.mainEntity, depth + 1);
}

/** The schema.org recipe in a page's HTML, or null when there isn't a usable one. */
export function recipeFromHtml(html: string): PageRecipe | null {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, body] of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue;
    }
    const r = findRecipe(data);
    if (!r) continue;
    const title = clean(r.name);
    const ingredientLines = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
      .map(clean)
      .filter(Boolean)
      .slice(0, 80);
    const steps = stepsFrom(r.recipeInstructions);
    if (!title || !ingredientLines.length || !steps.length) continue;
    const tags = [r.recipeCuisine, r.recipeCategory]
      .flatMap((t) => (Array.isArray(t) ? t : [t]))
      .map(clean)
      .filter((t) => t && t.length <= 40)
      .map((t) => t.toLowerCase());
    return {
      title: title.slice(0, 200),
      ingredientLines,
      steps,
      totalMinutes: isoMinutes(r.totalTime) ?? (() => {
        const sum = (isoMinutes(r.prepTime) ?? 0) + (isoMinutes(r.cookTime) ?? 0);
        return sum > 0 ? sum : null;
      })(),
      servings: servingsFrom(r.recipeYield),
      photoUrl: imageFrom(r.image),
      tags: [...new Set(tags)].slice(0, 4),
    };
  }
  return null;
}

/** The page's share image (og:image), if any. */
export function ogImage(html: string): string | null {
  const m = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/i)?.[0];
  const url = m?.match(/content=["']([^"']+)["']/i)?.[1];
  return url && /^https:\/\//i.test(url) ? decodeEntities(url) : null;
}

/** The readable text of a page, for Chef to write a recipe up from. */
export function pageText(html: string, max = 12_000): string {
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|li|h[1-6]|div|tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text.slice(0, max);
}
