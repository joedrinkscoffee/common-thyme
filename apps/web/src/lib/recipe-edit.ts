/**
 * The rules for an edited recipe. Shared by the recipe page's editor and the
 * server (and later by Chef), so every save is checked the same way.
 */
import { AMOUNT_OPTIONAL, formatIngredientLine, normalizeUnit, parseAmount, type Unit } from "./ingredient-line";

/** A regular tag, always offered in the editor; Chef uses it for dinners shared with the kids. */
export const KID_FRIENDLY_TAG = "kid friendly";

export const LIMITS = {
  title: 200,
  tags: 12,
  tag: 40,
  minutes: 600,
  servings: 24,
  ingredients: 80,
  ingredientName: 120,
  prep: 200,
  steps: 40,
  stepTitle: 200,
  stepBody: 4000,
  notes: 2000,
  url: 2000,
};

/** What the editor sends: amounts as typed, so "1 1/2" survives the trip. */
export type RecipeEditInput = {
  title: string;
  sourceUrl: string;
  totalMinutes: string;
  servings: number;
  tags: string[];
  notes: string;
  /** Cleared when someone confirms rebuilt steps are right. */
  stepsReconstructed: boolean;
  ingredients: { amount: string; unit: string; name: string; prep: string; ingredientId: string | null }[];
  steps: { title: string; body: string }[];
};

export type RecipeEditIngredient = {
  quantity: number | null;
  unit: Unit;
  name: string;
  prep: string | null;
  ingredientId: string | null;
  rawText: string;
};

export type RecipeEdit = {
  title: string;
  sourceUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  tags: string[];
  notes: string | null;
  stepsReconstructed: boolean;
  ingredients: RecipeEditIngredient[];
  steps: { title: string | null; body: string }[];
};

/** Field errors, keyed like "title", "ingredients.2.unit" or "steps.0". */
export type EditErrors = Record<string, string>;

export type Checked = { ok: true; recipe: RecipeEdit } | { ok: false; errors: EditErrors };

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const block = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "");

export function cleanUrl(v: string): string | null | undefined {
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

/** Checks an edited recipe. Returns it cleaned up, or every problem at once. */
export function validateRecipeEdit(input: unknown): Checked {
  const r = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof RecipeEditInput, unknown>>;
  const errors: EditErrors = {};

  const title = text(r.title);
  if (!title) errors.title = "Give the recipe a name.";
  else if (title.length > LIMITS.title) errors.title = `Keep the name under ${LIMITS.title} characters.`;

  const rawUrl = text(r.sourceUrl);
  const sourceUrl = rawUrl.length > LIMITS.url ? undefined : cleanUrl(rawUrl);
  if (sourceUrl === undefined) errors.sourceUrl = "That doesn't look like a web link.";

  const rawMinutes = text(r.totalMinutes);
  let totalMinutes: number | null = null;
  if (rawMinutes) {
    const n = Number(rawMinutes);
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.minutes) errors.totalMinutes = `Use whole minutes, 1 to ${LIMITS.minutes}.`;
    else totalMinutes = n;
  }

  const servings = Number(r.servings);
  if (!Number.isInteger(servings) || servings < 1 || servings > LIMITS.servings) {
    errors.servings = `Serves 1 to ${LIMITS.servings}.`;
  }

  const tags: string[] = [];
  for (const t of Array.isArray(r.tags) ? r.tags : []) {
    const tag = text(t).toLowerCase().slice(0, LIMITS.tag);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > LIMITS.tags) errors.tags = `Up to ${LIMITS.tags} tags.`;

  const ingredients: RecipeEditIngredient[] = [];
  const rows = Array.isArray(r.ingredients) ? r.ingredients : [];
  rows.forEach((row, n) => {
    const i = (row ?? {}) as Record<string, unknown>;
    const name = text(i.name).toLowerCase();
    const amount = text(i.amount);
    const prep = text(i.prep).toLowerCase();
    if (!name && !amount && !prep) return; // an empty row is just left out
    const key = `ingredients.${n}`;
    const unit = normalizeUnit(text(i.unit));
    const quantity = amount ? parseAmount(amount) : null;
    if (!name) errors[`${key}.name`] = "Which ingredient?";
    else if (name.length > LIMITS.ingredientName) errors[`${key}.name`] = "That name is too long.";
    if (prep.length > LIMITS.prep) errors[`${key}.prep`] = "Keep the prep note shorter.";
    if (!unit) errors[`${key}.unit`] = "Pick a unit.";
    if (amount && (quantity === null || quantity <= 0 || quantity >= 100000)) {
      errors[`${key}.amount`] = "Use a number like 2, 1.5 or 1 1/2.";
    } else if (!amount && unit && !AMOUNT_OPTIONAL.includes(unit)) {
      errors[`${key}.amount`] = "How much?";
    }
    if (!unit || !name) return;
    const id = typeof i.ingredientId === "string" && /^[0-9a-f-]{36}$/i.test(i.ingredientId) ? i.ingredientId : null;
    const parts = { quantity, unit, name, prep: prep || null };
    ingredients.push({ ...parts, ingredientId: id, rawText: formatIngredientLine(parts) });
  });
  if (!rows.length || (!ingredients.length && !Object.keys(errors).some((k) => k.startsWith("ingredients.")))) {
    errors.ingredients = "Add at least one ingredient.";
  }
  if (ingredients.length > LIMITS.ingredients) errors.ingredients = `Up to ${LIMITS.ingredients} ingredients.`;

  const steps: { title: string | null; body: string }[] = [];
  (Array.isArray(r.steps) ? r.steps : []).forEach((row, n) => {
    const s = (row ?? {}) as Record<string, unknown>;
    const stepTitle = text(s.title);
    const body = block(s.body);
    if (!stepTitle && !body) return;
    if (!body) errors[`steps.${n}`] = "Say what to do in this step.";
    else if (body.length > LIMITS.stepBody) errors[`steps.${n}`] = "This step is too long; split it in two?";
    if (stepTitle.length > LIMITS.stepTitle) errors[`steps.${n}.title`] = "Keep the step title shorter.";
    if (body) steps.push({ title: stepTitle || null, body });
  });
  if (!steps.length && !Object.keys(errors).some((k) => k.startsWith("steps."))) errors.steps = "Add at least one step.";
  if (steps.length > LIMITS.steps) errors.steps = `Up to ${LIMITS.steps} steps.`;

  const notes = block(r.notes);
  if (notes.length > LIMITS.notes) errors.notes = `Keep notes under ${LIMITS.notes} characters.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    recipe: {
      title,
      sourceUrl: sourceUrl ?? null,
      totalMinutes,
      servings,
      tags,
      notes: notes || null,
      stepsReconstructed: r.stepsReconstructed === true,
      ingredients,
      steps,
    },
  };
}
