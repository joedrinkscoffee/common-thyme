/**
 * The recipe import file: one JSON document with every recipe from Airtable
 * and ReciMe, already merged and cleaned up. The app checks it here, then
 * saves recipes one at a time so a bad row never blocks the rest.
 */

export type ImportOrigin = "airtable" | "recime" | "link" | "manual";

export type ImportIngredient = {
  /** The line as written, e.g. "1 tbsp capers, rinsed". */
  raw: string;
  /** The shopping name, e.g. "Capers". Lines without one (water, salt) are kept as text only. */
  name: string | null;
  quantity: number | null;
  unit: string | null;
  perishable: boolean;
};

export type ImportStep = { title: string | null; body: string };

export type ImportRecipe = {
  origin: ImportOrigin;
  /** Id in the source system, so the import can be re-run without duplicates. */
  ref: string;
  title: string;
  sourceUrl: string | null;
  photoUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  tags: string[];
  stepsReconstructed: boolean;
  notes: string | null;
  ingredients: ImportIngredient[];
  steps: ImportStep[];
};

export type ParsedImport = { recipes: ImportRecipe[]; problems: string[] };

const ORIGINS: ImportOrigin[] = ["airtable", "recime", "link", "manual"];

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function url(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Checks one recipe; returns it cleaned up, or the reason it can't be imported. */
export function parseRecipe(input: unknown): ImportRecipe | string {
  if (!input || typeof input !== "object") return "not a recipe";
  const r = input as Record<string, unknown>;
  const title = str(r.title, 200);
  if (!title) return "missing a title";
  const origin = ORIGINS.includes(r.origin as ImportOrigin) ? (r.origin as ImportOrigin) : null;
  const ref = str(r.ref, 200);
  if (!origin || !ref) return `"${title}" is missing where it came from`;

  const ingredients: ImportIngredient[] = [];
  for (const item of Array.isArray(r.ingredients) ? r.ingredients : []) {
    const i = (item ?? {}) as Record<string, unknown>;
    const raw = str(i.raw, 300);
    if (!raw) continue;
    ingredients.push({
      raw,
      name: str(i.name, 120),
      quantity: num(i.quantity),
      unit: str(i.unit, 40),
      perishable: i.perishable === true,
    });
  }

  const steps: ImportStep[] = [];
  for (const item of Array.isArray(r.steps) ? r.steps : []) {
    const s = (item ?? {}) as Record<string, unknown>;
    const body = str(s.body, 4000);
    if (body) steps.push({ title: str(s.title, 200), body });
  }

  const minutes = num(r.totalMinutes);
  const servings = num(r.servings);
  return {
    origin,
    ref,
    title,
    sourceUrl: url(r.sourceUrl),
    photoUrl: url(r.photoUrl),
    totalMinutes: minutes && minutes < 1440 ? Math.round(minutes) : null,
    servings: servings && servings <= 24 ? Math.round(servings) : 2,
    tags: (Array.isArray(r.tags) ? r.tags : [])
      .map((t) => str(t, 40))
      .filter((t): t is string => !!t)
      .slice(0, 12),
    stepsReconstructed: r.stepsReconstructed === true,
    notes: str(r.notes, 2000),
    ingredients: ingredients.slice(0, 80),
    steps: steps.slice(0, 40),
  };
}

/** Reads the whole import file. Recipes that fail checks are listed in `problems`. */
export function parseImportFile(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { recipes: [], problems: ["That file isn't valid JSON."] };
  }
  const list = (data as { recipes?: unknown })?.recipes;
  if (!Array.isArray(list)) return { recipes: [], problems: ["That file has no recipes list."] };

  const recipes: ImportRecipe[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  list.forEach((item, n) => {
    const parsed = parseRecipe(item);
    if (typeof parsed === "string") {
      problems.push(`Recipe ${n + 1}: ${parsed}`);
      return;
    }
    const key = `${parsed.origin}:${parsed.ref}`;
    if (seen.has(key)) {
      problems.push(`"${parsed.title}" appears twice; kept the first one`);
      return;
    }
    seen.add(key);
    recipes.push(parsed);
  });
  return { recipes, problems };
}

/** File extension for a photo's content type, or null when it isn't a photo we keep. */
export function photoExtension(contentType: string | null): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" }[type] ?? null;
}
