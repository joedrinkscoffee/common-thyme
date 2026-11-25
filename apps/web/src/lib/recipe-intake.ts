/**
 * Adds one recipe from a link or a photo, for the Add recipes page.
 *
 * Links: most recipe sites publish the recipe as schema.org data, which is
 * read for free. Pages without it, and every photo, go to Claude, which
 * writes the recipe up as structured JSON. Saving goes through the same path
 * as Chef, so recipes land exactly as if Chef had added them.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { CallModel } from "./chef/agent";
import type { FetchedPage } from "./chef/fetch-page";
import type { ChefStore, NewRecipe } from "./chef/store";

/**
 * Copying a recipe out of a page or photo is transcription, not planning, so it runs on
 * Sonnet (half Opus's price per token). Set RECIPE_MODEL in Vercel to switch it back.
 */
export const RECIPE_MODEL = process.env.RECIPE_MODEL || "claude-sonnet-5-5";

export type IntakeResult =
  | { status: "saved"; id: string; title: string; photo: boolean }
  | { status: "duplicate"; title: string; id: string | null }
  | { status: "failed"; error: string };

export type IntakeDeps = {
  store: Pick<ChefStore, "createRecipe">;
  call: CallModel;
  fetchPage: (url: string) => Promise<FetchedPage>;
  /** The household's tags, so Claude reuses their spelling. */
  tags: string[];
};

export type PhotoInput = { bytes: Uint8Array; contentType: "image/jpeg" | "image/png" | "image/webp" };

type Extracted = {
  found: boolean;
  reason: string;
  title: string;
  ingredients: string[];
  steps: string[];
  minutes: number;
  servings: number;
  tags: string[];
  perishable: string[];
  shows_finished_dish: boolean;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "reason", "title", "ingredients", "steps", "minutes", "servings", "tags", "perishable", "shows_finished_dish"],
  properties: {
    found: { type: "boolean", description: "True only if a full recipe (ingredients and steps) is there." },
    reason: { type: "string", description: "When found is false, a short plain reason for the person, e.g. 'This page is a list of 20 recipes, not one recipe.' Otherwise ''." },
    title: { type: "string" },
    ingredients: { type: "array", items: { type: "string" }, description: "Every ingredient line as written, one per item, with amounts." },
    steps: { type: "array", items: { type: "string" }, description: "Every step as written, one per item, without step numbers." },
    minutes: { type: "integer", description: "Total time in minutes, or 0 if not given." },
    servings: { type: "integer", description: "Servings, or 0 if not given." },
    tags: { type: "array", items: { type: "string" }, description: "1 to 4 short tags (cuisine, main protein, meal type)." },
    perishable: { type: "array", items: { type: "string" }, description: "Base names of fresh produce, fresh herbs, pricey cheeses or condiments, and proteins that come in packs: things worth sharing across a week's meals. Leave out cheap staples like garlic, onion, oil, salt and spices." },
    shows_finished_dish: { type: "boolean", description: "For a photo: true if it shows the cooked dish well enough to use as the recipe's picture. For a page: false." },
  },
} as const;

const SYSTEM = `You copy recipes into a meal planning app. You get a recipe web page's text or a photo (a cookbook page, a recipe card, a handwritten note, or a screenshot from Instagram, TikTok or a website).

Copy the recipe faithfully: every ingredient line with its amount, and every step. Don't invent amounts or steps that aren't there; fix obvious typos and reading errors only. If several recipes are shown, take the main one. If the text or photo has no complete recipe (no ingredients, or no method), set found to false and say why in one short sentence.`;

const strings = (v: unknown, max: number, len = 2000): string[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max);

/** Reads Claude's JSON answer defensively: anything missing or odd is dropped. */
export function readExtracted(text: string): Extracted | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const int = (v: unknown, max: number) => (typeof v === "number" && v > 0 && v <= max ? Math.round(v) : 0);
  return {
    found: raw.found === true,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 300) : "",
    title: typeof raw.title === "string" ? raw.title.replace(/\s+/g, " ").trim().slice(0, 200) : "",
    ingredients: strings(raw.ingredients, 80, 300),
    steps: strings(raw.steps, 40),
    minutes: int(raw.minutes, 600),
    servings: int(raw.servings, 24),
    tags: strings(raw.tags, 4, 40),
    perishable: strings(raw.perishable, 40, 80),
    shows_finished_dish: raw.shows_finished_dish === true,
  };
}

async function extract(deps: IntakeDeps, content: Anthropic.Beta.BetaContentBlockParam[]): Promise<Extracted | string> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await deps.call({
      model: RECIPE_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch {
    return "Chef couldn't read it just now. Try again in a minute.";
  }
  if (response.stop_reason === "refusal") return "Chef couldn't read that one.";
  const text = response.content.find((b) => b.type === "text");
  const got = text && text.type === "text" ? readExtracted(text.text) : null;
  if (!got) return "Chef couldn't read that one.";
  if (!got.found || !got.title || !got.ingredients.length || !got.steps.length) return got.reason || "There's no full recipe there.";
  return got;
}

function tagHint(tags: string[]): string {
  return tags.length ? `\n\nTags this household already uses (reuse these spellings when they fit): ${tags.slice(0, 60).join(", ")}` : "";
}

async function save(deps: IntakeDeps, recipe: NewRecipe): Promise<IntakeResult> {
  const saved = await deps.store.createRecipe(recipe);
  if (saved.ok) return { status: "saved", id: saved.id, title: saved.title, photo: saved.photo };
  const dup = saved.error.match(/^Already in your recipes as "(.*)" \(id ([^)]+)\)/);
  if (dup) return { status: "duplicate", title: dup[1], id: dup[2] };
  return { status: "failed", error: saved.error };
}

function fromExtracted(e: Extracted, sourceUrl: string | null, photo: NewRecipe["photo"]): NewRecipe {
  return {
    title: e.title,
    sourceUrl,
    totalMinutes: e.minutes || null,
    servings: e.servings || 2,
    tags: e.tags,
    ingredientLines: e.ingredients,
    steps: e.steps.map((body) => ({ title: null, body })),
    perishable: e.perishable,
    notes: null,
    photo,
  };
}

export async function addFromLink(deps: IntakeDeps, url: string): Promise<IntakeResult> {
  const page = await deps.fetchPage(url);
  if (!page.ok) return { status: "failed", error: page.error };
  const r = page.recipe;
  if (r) {
    return save(deps, {
      title: r.title,
      sourceUrl: page.url,
      totalMinutes: r.totalMinutes,
      servings: r.servings ?? 2,
      tags: r.tags,
      ingredientLines: r.ingredientLines,
      steps: r.steps,
      perishable: [],
      notes: null,
      photo: r.photoUrl ? { url: r.photoUrl } : page.image ? { url: page.image } : null,
    });
  }
  if (page.text.trim().length < 200) return { status: "failed", error: "That page has almost no text; the site may need a sign-in. Try a screenshot instead." };
  const got = await extract(deps, [{ type: "text", text: `Recipe page ${page.url}:\n\n${page.text.slice(0, 60_000)}${tagHint(deps.tags)}` }]);
  if (typeof got === "string") return { status: "failed", error: got };
  return save(deps, fromExtracted(got, page.url, page.image ? { url: page.image } : null));
}

export async function addFromPhoto(deps: IntakeDeps, photo: PhotoInput): Promise<IntakeResult> {
  const got = await extract(deps, [
    { type: "image", source: { type: "base64", media_type: photo.contentType, data: Buffer.from(photo.bytes).toString("base64") } },
    { type: "text", text: `Copy the recipe in this photo.${tagHint(deps.tags)}` },
  ]);
  if (typeof got === "string") return { status: "failed", error: got };
  // A photo of a cookbook page makes a poor recipe picture; the page asks for one instead.
  return save(deps, fromExtracted(got, null, got.shows_finished_dish ? { bytes: photo.bytes, contentType: photo.contentType } : null));
}
