import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAmount, matchKey, parseIngredientLine } from "@/lib/ingredient-line";
import { downloadPhoto } from "@/lib/photo-fetch";
import { photoPathFor } from "@/lib/recipe-photo";
import { updateRecipe } from "@/lib/recipe-save";
import type { RecipeEditInput } from "@/lib/recipe-edit";
import type { CatalogRecipe } from "./planner";
import { tierOf, type ShareTier } from "./ingredient-tier";
import { addDays } from "./dates";
import { normalizeUnit } from "@/lib/ingredient-line";
import { extraKey, type GroceryLine, type GroceryMark } from "@/lib/grocery/list";
import type { Aisle } from "@/lib/grocery/aisles";
import {
  DEFAULT_SETTINGS,
  type ChefNote,
  type ChefStore,
  type CreateRecipeResult,
  type NewRecipe,
  type PlanStatus,
  type RecipeFacts,
  type DinnerPatch,
  type NewDinner,
  type StoredDinner,
  byDayAndMeal,
  type StoredPlan,
  type GroceryWeek,
} from "./store";

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type DinnerRow = {
  id: string;
  plan_id: string;
  date: string;
  meal: StoredDinner["meal"] | null;
  recipe_id: string;
  shared_with_kids: boolean;
  servings: number;
  status: StoredDinner["status"];
  moved_to: string | null;
  push_count: number;
};
const DINNER_COLUMNS = "id, plan_id, date, meal, recipe_id, shared_with_kids, servings, status, moved_to, push_count";
const toDinner = (r: DinnerRow): StoredDinner => ({
  id: r.id,
  planId: r.plan_id,
  date: r.date,
  meal: r.meal ?? "dinner",
  recipeId: r.recipe_id,
  sharedWithKids: r.shared_with_kids,
  servings: r.servings,
  status: r.status,
  movedTo: r.moved_to,
  pushCount: r.push_count ?? 0,
});

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "no row"}`);
}

/** Chef's view of one household, through the signed-in person's Supabase session. */
export class SupabaseChefStore implements ChefStore {
  constructor(
    private db: SupabaseClient,
    private householdId: string,
    private userId: string | null,
  ) {}

  async settings() {
    const { data } = await this.db
      .from("household_settings")
      .select("timezone, dinners_per_week, base_servings, kids_extra_servings, no_repeat_weeks")
      .eq("household_id", this.householdId)
      .maybeSingle();
    if (!data) return DEFAULT_SETTINGS;
    return {
      timezone: data.timezone,
      dinnersPerWeek: data.dinners_per_week,
      baseServings: data.base_servings,
      kidsExtraServings: data.kids_extra_servings,
      noRepeatWeeks: data.no_repeat_weeks,
    };
  }

  async catalog(): Promise<CatalogRecipe[]> {
    const { data, error } = await this.db
      .from("recipes")
      .select("id, title, tags, total_minutes, recipe_ingredients(name, ingredients(name, perishable, share_tier))")
      .eq("household_id", this.householdId)
      .is("archived_at", null)
      .order("title");
    if (error) fail("read recipes", error);
    type Line = { name: string | null; ingredients: One<{ name: string; perishable: boolean; share_tier: string | null }> };
    return (data ?? []).map((r) => {
      const useUp = new Set<string>();
      const pantry = new Set<string>();
      const stockUp = new Set<string>();
      for (const line of (r.recipe_ingredients ?? []) as Line[]) {
        const ing = one(line.ingredients);
        if (!ing) continue;
        const tier = tierOf(ing.name, ing.perishable, ing.share_tier);
        if (tier === "use_up") useUp.add(matchKey(ing.name));
        else if (tier === "pantry") pantry.add(matchKey(ing.name));
        else if (tier === "stock_up") stockUp.add(matchKey(ing.name));
      }
      return { id: r.id, title: r.title, tags: r.tags ?? [], totalMinutes: r.total_minutes, useUp: [...useUp].sort(), pantry: [...pantry].sort(), stockUp: [...stockUp].sort() };
    });
  }

  async recipe(id: string): Promise<RecipeFacts | null> {
    const { data } = await this.db
      .from("recipes")
      .select("id, title, base_servings, total_minutes, tags, recipe_ingredients(position, raw_text), recipe_steps(position)")
      .eq("id", id)
      .eq("household_id", this.householdId)
      .maybeSingle();
    if (!data) return null;
    const lines = ((data.recipe_ingredients ?? []) as { position: number; raw_text: string }[]).sort((a, b) => a.position - b.position);
    return {
      id: data.id,
      title: data.title,
      servings: data.base_servings,
      totalMinutes: data.total_minutes,
      tags: data.tags ?? [],
      ingredients: lines.map((l) => l.raw_text),
      stepCount: (data.recipe_steps ?? []).length,
    };
  }

  async createRecipe(recipe: NewRecipe): Promise<CreateRecipeResult> {
    const origin = recipe.sourceUrl ? "link" : "manual";
    if (recipe.sourceUrl) {
      const { data: existing } = await this.db
        .from("recipes")
        .select("id, title, archived_at")
        .eq("household_id", this.householdId)
        .eq("source_url", recipe.sourceUrl)
        .limit(1)
        .maybeSingle();
      if (existing && !existing.archived_at) return { ok: false, error: `Already in your recipes as "${existing.title}" (id ${existing.id}).` };
    }

    const { data: row, error } = await this.db
      .from("recipes")
      .insert({
        household_id: this.householdId,
        title: recipe.title.slice(0, 200),
        origin,
        origin_ref: crypto.randomUUID(),
        base_servings: recipe.servings,
      })
      .select("id, updated_at")
      .single();
    if (error || !row) return { ok: false, error: "Couldn't create the recipe." };

    const input: RecipeEditInput = {
      title: recipe.title,
      sourceUrl: recipe.sourceUrl ?? "",
      totalMinutes: recipe.totalMinutes ? String(recipe.totalMinutes) : "",
      servings: recipe.servings,
      tags: recipe.tags,
      notes: recipe.notes ?? "",
      stepsReconstructed: false,
      ingredients: recipe.ingredientLines.map((raw) => {
        const p = parseIngredientLine(raw);
        const unit = p.unit ?? (p.quantity !== null ? "each" : "to taste");
        return {
          amount: p.quantity !== null ? formatAmount(p.quantity) : "",
          unit,
          name: (p.name ?? raw).slice(0, 120),
          prep: p.prep ?? "",
          ingredientId: null,
        };
      }),
      steps: recipe.steps.map((s) => ({ title: s.title ?? "", body: s.body })),
    };
    const saved = await updateRecipe(row.id, input, null);
    if (!saved.ok) {
      await this.db.from("recipes").delete().eq("id", row.id);
      const details = saved.errors ? ` ${Object.entries(saved.errors).map(([k, v]) => `${k}: ${v}`).join("; ")}` : "";
      return { ok: false, error: `${saved.error}${details}` };
    }

    if (recipe.perishable.length) {
      const wanted = new Set(recipe.perishable.map(matchKey));
      const { data: ings } = await this.db.from("ingredients").select("id, name, perishable").eq("household_id", this.householdId);
      const ids = (ings ?? []).filter((i) => !i.perishable && wanted.has(matchKey(i.name))).map((i) => i.id);
      if (ids.length) await this.db.from("ingredients").update({ perishable: true }).in("id", ids);
    }

    let photo = false;
    if (recipe.photo) {
      let bytes: ArrayBuffer | Uint8Array | null = null;
      let type = "";
      if ("bytes" in recipe.photo) {
        bytes = recipe.photo.bytes;
        type = recipe.photo.contentType;
      } else {
        const got = await downloadPhoto(recipe.photo.url);
        if (got) {
          bytes = got.bytes;
          type = got.type;
        }
      }
      const path = bytes ? photoPathFor(this.householdId, row.id, type, Date.now()) : null;
      if (bytes && path) {
        const { error: upErr } = await this.db.storage.from("recipe-photos").upload(path, bytes, { contentType: type });
        if (!upErr) {
          await this.db.from("recipes").update({ photo_path: path }).eq("id", row.id);
          photo = true;
        }
      }
    }
    return { ok: true, id: row.id, title: recipe.title, photo };
  }

  async setIngredientTier(name: string, tier: ShareTier): Promise<number> {
    const key = matchKey(name);
    const { data } = await this.db.from("ingredients").select("id, name").eq("household_id", this.householdId);
    const ids = (data ?? []).filter((i) => matchKey(i.name) === key).map((i) => i.id);
    if (!ids.length) return 0;
    const { error } = await this.db.from("ingredients").update({ share_tier: tier }).in("id", ids);
    if (error) fail("set ingredient tier", error);
    return ids.length;
  }

  async plans(from: string, to: string): Promise<StoredPlan[]> {
    const { data, error } = await this.db
      .from("meal_plans")
      .select("id, week_start, status")
      .eq("household_id", this.householdId)
      .gte("week_start", from)
      .lte("week_start", to);
    if (error) fail("read plans", error);
    return (data ?? []).map((p) => ({ id: p.id, weekStart: p.week_start, status: p.status }));
  }

  async ensurePlan(weekStart: string): Promise<StoredPlan> {
    const { data, error } = await this.db
      .from("meal_plans")
      .upsert({ household_id: this.householdId, week_start: weekStart }, { onConflict: "household_id,week_start", ignoreDuplicates: true })
      .select("id, week_start, status");
    if (error) fail("save plan", error);
    if (data?.[0]) return { id: data[0].id, weekStart: data[0].week_start, status: data[0].status };
    const [existing] = await this.plans(weekStart, weekStart);
    if (!existing) fail("find plan", null);
    return existing;
  }

  async setPlanStatus(planId: string, status: PlanStatus) {
    const approved = status === "approved";
    const { error } = await this.db
      .from("meal_plans")
      .update({ status, approved_at: approved ? new Date().toISOString() : null, approved_by: approved ? this.userId : null })
      .eq("id", planId);
    if (error) fail("update plan", error);
  }

  async dinners(from: string, to: string): Promise<StoredDinner[]> {
    const { data, error } = await this.db
      .from("planned_dinners")
      .select(DINNER_COLUMNS)
      .eq("household_id", this.householdId)
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("created_at");
    if (error) fail("read dinners", error);
    return ((data ?? []) as DinnerRow[]).map(toDinner).sort(byDayAndMeal);
  }

  async dinner(id: string): Promise<StoredDinner | null> {
    const { data, error } = await this.db.from("planned_dinners").select(DINNER_COLUMNS).eq("id", id).eq("household_id", this.householdId).maybeSingle();
    if (error) fail("read dinner", error);
    return data ? toDinner(data as DinnerRow) : null;
  }

  async addDinner(d: NewDinner): Promise<StoredDinner> {
    const { data, error } = await this.db
      .from("planned_dinners")
      .insert({
        plan_id: d.planId,
        household_id: this.householdId,
        recipe_id: d.recipeId,
        date: d.date,
        meal: d.meal ?? "dinner",
        shared_with_kids: d.sharedWithKids,
        servings: d.servings,
        push_count: d.pushCount ?? 0,
      })
      .select(DINNER_COLUMNS)
      .single();
    if (error || !data) fail("add dinner", error);
    return toDinner(data as DinnerRow);
  }

  async updateDinner(id: string, patch: DinnerPatch) {
    const row: Record<string, unknown> = {};
    if (patch.recipeId !== undefined) row.recipe_id = patch.recipeId;
    if (patch.sharedWithKids !== undefined) row.shared_with_kids = patch.sharedWithKids;
    if (patch.servings !== undefined) row.servings = patch.servings;
    if (patch.status !== undefined) {
      row.status = patch.status;
      row.cooked_at = patch.status === "cooked" ? new Date().toISOString() : null;
      row.cooked_by = patch.status === "cooked" ? this.userId : null;
    }
    if (patch.movedTo !== undefined) row.moved_to = patch.movedTo;
    const { error } = await this.db.from("planned_dinners").update(row).eq("id", id).eq("household_id", this.householdId);
    if (error) fail("update dinner", error);
  }

  async deleteDinner(id: string) {
    const { error } = await this.db.from("planned_dinners").delete().eq("id", id).eq("household_id", this.householdId);
    if (error) fail("remove dinner", error);
  }

  async groceryWeek(weekStart: string): Promise<GroceryWeek> {
    type IngRow = { name: string; aisle?: string | null };
    type LineRow = { position: number; raw_text: string; quantity: number | string | null; unit: string | null; name: string | null; ingredients: One<IngRow> };
    type MealRow = { id: string; date: string; meal: StoredDinner["meal"] | null; servings: number; recipes: One<{ title: string; base_servings: number; recipe_ingredients: LineRow[] | null }> };
    const read = (aisle: boolean) =>
      this.db
        .from("planned_dinners")
        .select(`id, date, meal, servings, recipes(title, base_servings, recipe_ingredients(position, raw_text, quantity, unit, name, ingredients(name${aisle ? ", aisle" : ""})))`)
        .eq("household_id", this.householdId)
        .gte("date", weekStart)
        .lte("date", addDays(weekStart, 6))
        .in("status", ["planned", "cooked"]);
    let got = await read(true);
    // Before the grocery migration runs there's no aisle column; read without it.
    if (got.error) got = await read(false);
    if (got.error) fail("read grocery meals", got.error);
    const meals = ((got.data ?? []) as unknown as MealRow[])
      .map((d) => {
        const r = one(d.recipes);
        const lines: GroceryLine[] = [...(r?.recipe_ingredients ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((l) => {
            const ing = one(l.ingredients);
            const parsed = l.name ? null : parseIngredientLine(l.raw_text);
            return {
              raw: l.raw_text,
              name: ing?.name ?? l.name ?? parsed?.name ?? null,
              quantity: parsed ? parsed.quantity : l.quantity === null ? null : Number(l.quantity),
              unit: parsed ? parsed.unit : normalizeUnit(l.unit),
              aisle: ing?.aisle ?? null,
            };
          });
        return { id: d.id, date: d.date, meal: d.meal ?? "dinner", title: r?.title ?? "a deleted recipe", scale: d.servings / (r?.base_servings || 2), lines };
      })
      .sort(byDayAndMeal);

    const { data: rows, error } = await this.db
      .from("grocery_items")
      .select("item_key, label, aisle, checked_at, checked_by")
      .eq("household_id", this.householdId)
      .eq("week_start", weekStart);
    if (error) return { meals, marks: [], ready: false };
    const people = [...new Set((rows ?? []).map((r) => r.checked_by).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (people.length) {
      const { data: ps } = await this.db.from("profiles").select("id, display_name").in("id", people);
      for (const p of ps ?? []) if (p.display_name) names.set(p.id, p.display_name.split(" ")[0]);
    }
    const marks: GroceryMark[] = (rows ?? []).map((r) => ({
      key: r.item_key,
      label: r.label,
      aisle: r.aisle,
      checked: !!r.checked_at,
      checkedBy: r.checked_by ? (names.get(r.checked_by) ?? null) : null,
    }));
    return { meals, marks, ready: true };
  }

  async checkGroceryItem(weekStart: string, key: string, checked: boolean) {
    const { error } = await this.db.from("grocery_items").upsert(
      {
        household_id: this.householdId,
        week_start: weekStart,
        item_key: key.slice(0, 120),
        checked_at: checked ? new Date().toISOString() : null,
        checked_by: checked ? this.userId : null,
      },
      { onConflict: "household_id,week_start,item_key" },
    );
    if (error) fail("check grocery item", error);
  }

  async addGroceryItem(weekStart: string, label: string, aisle: Aisle | null) {
    const key = extraKey(label);
    const { error } = await this.db.from("grocery_items").upsert(
      { household_id: this.householdId, week_start: weekStart, item_key: key, label: label.slice(0, 120), aisle, checked_at: null, checked_by: null },
      { onConflict: "household_id,week_start,item_key" },
    );
    if (error) fail("add grocery item", error);
    return key;
  }

  async removeGroceryItem(weekStart: string, key: string) {
    const { error } = await this.db.from("grocery_items").delete().eq("household_id", this.householdId).eq("week_start", weekStart).eq("item_key", key);
    if (error) fail("remove grocery item", error);
  }

  async setIngredientAisle(name: string, aisle: Aisle | null): Promise<number> {
    const key = matchKey(name);
    const { data } = await this.db.from("ingredients").select("id, name").eq("household_id", this.householdId);
    const ids = (data ?? []).filter((i) => matchKey(i.name) === key).map((i) => i.id);
    if (!ids.length) return 0;
    const { error } = await this.db.from("ingredients").update({ aisle }).in("id", ids);
    if (error) fail("set ingredient aisle", error);
    return ids.length;
  }

  async notes(): Promise<ChefNote[]> {
    const { data } = await this.db
      .from("chef_notes")
      .select("id, source, category, body")
      .eq("household_id", this.householdId)
      .eq("active", true)
      .order("created_at");
    return (data ?? []) as ChefNote[];
  }

  async addNote(note: Omit<ChefNote, "id">): Promise<ChefNote> {
    const { data, error } = await this.db
      .from("chef_notes")
      .insert({ household_id: this.householdId, created_by: this.userId, ...note })
      .select("id, source, category, body")
      .single();
    if (error || !data) fail("save note", error);
    return data as ChefNote;
  }

  async forgetNote(id: string) {
    const { error } = await this.db.from("chef_notes").update({ active: false }).eq("id", id).eq("household_id", this.householdId);
    if (error) fail("forget note", error);
  }
}
