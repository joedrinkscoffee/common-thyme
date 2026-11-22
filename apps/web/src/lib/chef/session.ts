/**
 * One Chef turn's working state: what the household has, short references
 * Chef uses for recipes ("r12"), dinners ("d3") and notes ("n2"), and a log
 * of what Chef changed. Every tool goes through here.
 */
import { addDays, dayName, daysBetween, isIsoDate, shortDate, weekStartOf, weekdayIndex } from "./dates";
import { isKidFriendly, planWeek, type CatalogRecipe } from "./planner";
import type { ChefNote, ChefStore, HouseholdSettings, NoteCategory, StoredDinner, StoredPlan } from "./store";
import { fetchRecipePage } from "./fetch-page";
import { SHARE_TIERS, TIER_LABEL, sortByTier, type ShareTier } from "./ingredient-tier";
import { rollOver } from "./check-in";
import { defaultNights, holidaysInWeek, isOpenNight, type Holiday } from "./holidays";
import { monthOfWeek, seasonText } from "./season";
import type { CalendarNight } from "./calendar";

export type Attachment = { bytes: Uint8Array; contentType: string };
export type Choice = { question: string; choices: string[] };
export type ToolOutcome = { ok: boolean; text: string };
/** What the last plan_week call drafted, for the auto-draft message. */
export type DraftSummary = {
  weekStart: string;
  nights: string[];
  kidNights: number;
  shared: { name: string; nights: number }[];
  holidays: Holiday[];
  /** Calendar nights in the week: left open (away) or given a quick dinner (busy). */
  calendar: CalendarNight[];
};

const HOLIDAY_HINT: Record<Holiday["effect"], string> = {
  skip: "a holiday meal of its own; plan_week leaves it open",
  leftovers: "leftovers night; plan_week leaves it open",
  quick: "a busy evening; pass it as quick",
  cookout: "a cookout day; grill dinners fit if they have them",
  note: "worth a mention; ask if it changes anything",
};

const NOTE_CATEGORIES: NoteCategory[] = ["household", "tastes", "habits"];

export class ChefSession {
  catalog: CatalogRecipe[] = [];
  settings!: HouseholdSettings;
  notes: ChefNote[] = [];
  changes: string[] = [];
  choice: Choice | null = null;
  addedRecipes: { id: string; title: string }[] = [];
  lastDraft: DraftSummary | null = null;
  /** Nights the household calendar changes; null when no calendar is linked. */
  calendar: CalendarNight[] | null = null;

  private recipeRef = new Map<string, string>(); // ref -> id
  private recipeRefOf = new Map<string, string>(); // id -> ref
  private dinnerRef = new Map<string, string>();
  private dinnerRefOf = new Map<string, string>();
  private noteRef = new Map<string, string>();

  constructor(
    readonly store: ChefStore,
    readonly today: string,
    readonly attachment: Attachment | null = null,
    readonly fetchPage: typeof fetchRecipePage = fetchRecipePage,
  ) {}

  async load() {
    [this.settings, this.catalog, this.notes] = await Promise.all([this.store.settings(), this.store.catalog(), this.store.notes()]);
    this.catalog.forEach((r, i) => this.refRecipe(r.id, i + 1));
    this.notes.forEach((n, i) => this.noteRef.set(`n${i + 1}`, n.id));
  }

  // ---------------------------------------------------------------- refs

  private refRecipe(id: string, n = this.recipeRef.size + 1) {
    const ref = `r${n}`;
    this.recipeRef.set(ref, id);
    this.recipeRefOf.set(id, ref);
    return ref;
  }
  recipeRefFor(id: string) {
    return this.recipeRefOf.get(id) ?? "r?";
  }
  dinnerRefFor(id: string) {
    let ref = this.dinnerRefOf.get(id);
    if (!ref) {
      ref = `d${this.dinnerRef.size + 1}`;
      this.dinnerRef.set(ref, id);
      this.dinnerRefOf.set(id, ref);
    }
    return ref;
  }
  noteRefs() {
    return this.notes.map((n, i) => ({ ref: `n${i + 1}`, note: n }));
  }
  private recipeOf(ref: unknown): CatalogRecipe | null {
    const id = typeof ref === "string" ? this.recipeRef.get(ref.trim()) : undefined;
    return (id && this.catalog.find((r) => r.id === id)) || null;
  }
  title(id: string) {
    return this.catalog.find((r) => r.id === id)?.title ?? "a deleted recipe";
  }
  private servings(kids: boolean) {
    return this.settings.baseServings + (kids ? this.settings.kidsExtraServings : 0);
  }

  // ---------------------------------------------------------------- reading

  /** The weeks Chef talks about: last week, this week and the two after. */
  async weeks() {
    const thisWeek = weekStartOf(this.today);
    const from = addDays(thisWeek, -7);
    const to = addDays(thisWeek, 27);
    const [plans, dinners] = await Promise.all([this.store.plans(from, addDays(thisWeek, 21)), this.store.dinners(from, to)]);
    return [-7, 0, 7, 14].map((offset) => {
      const weekStart = addDays(thisWeek, offset);
      return {
        weekStart,
        offset,
        plan: plans.find((p) => p.weekStart === weekStart) ?? null,
        dinners: dinners.filter((d) => weekStartOf(d.date) === weekStart && d.status !== "moved"),
      };
    });
  }

  describeDinner(d: StoredDinner) {
    const status = d.status === "planned" && d.date < this.today ? "planned, not checked in" : d.status;
    return `${this.dinnerRefFor(d.id)} ${dayName(d.date, "short")} ${d.date}: ${this.title(d.recipeId)} [${this.recipeRefFor(d.recipeId)}]${d.sharedWithKids ? ", shared with kids" : ""}, ${status}`;
  }

  /** The household's current state, as plain text for Chef. */
  async stateText(partnerJoined: boolean): Promise<string> {
    const weeks = await this.weeks();
    const label = (o: number) => ({ [-7]: "last week", 0: "this week", 7: "next week", 14: "the week after" })[o];
    const lines = [
      `Today is ${dayName(this.today)}, ${this.today}.`,
      `Season: ${seasonText(monthOfWeek(weekStartOf(this.today)))}`,
      `Settings: ${this.settings.dinnersPerWeek} dinners a week usually; ${this.settings.baseServings} servings, +${this.settings.kidsExtraServings} when shared with the kids; avoid repeating a recipe within ${this.settings.noRepeatWeeks} weeks.`,
      `Partner has ${partnerJoined ? "joined" : "not joined yet"}.`,
      "",
    ];
    for (const w of weeks) {
      const status = w.plan ? (w.plan.status === "approved" ? "locked in" : "draft") : "no plan";
      lines.push(`Week of ${w.weekStart} (${label(w.offset)}, ${status}):`);
      for (const h of holidaysInWeek(w.weekStart)) lines.push(`  Holiday: ${dayName(h.date, "short")} ${h.date} ${h.name} (${HOLIDAY_HINT[h.effect]})`);
      for (const c of this.calendarIn(w.weekStart)) {
        const hint = c.kind === "away" ? "looks like travel; plan_week leaves it open" : "busy at dinnertime; plan_week makes it quick";
        lines.push(`  Calendar: ${dayName(c.date, "short")} ${c.date} ${c.titles.join("; ")} (${hint})`);
      }
      if (!w.dinners.length) lines.push("  (no dinners)");
      for (const d of w.dinners) lines.push(`  ${this.describeDinner(d)}`);
    }
    if (this.calendar === null) lines.push("", "Calendar: not linked. They can link one on the What Chef knows page.");
    lines.push("", "What you know about this household:");
    if (!this.notes.length) lines.push("  (nothing yet)");
    for (const { ref, note } of this.noteRefs()) lines.push(`  ${ref} [${note.source === "you_said" ? "they said" : "you learned"}, ${note.category}] ${note.body}`);
    return lines.join("\n");
  }

  calendarIn(weekStart: string): CalendarNight[] {
    const end = addDays(weekStart, 6);
    return (this.calendar ?? []).filter((c) => c.date >= weekStart && c.date <= end);
  }

  private async dinnerOf(ref: unknown): Promise<StoredDinner | null> {
    const id = typeof ref === "string" ? this.dinnerRef.get(ref.trim()) : undefined;
    if (!id) return null;
    const d = await this.store.dinners(addDays(this.today, -60), addDays(this.today, 120));
    return d.find((x) => x.id === id) ?? null;
  }

  private dateError(date: unknown, allowPast = false): string | null {
    if (!isIsoDate(date)) return "Dates look like 2026-11-24.";
    if (!allowPast && date < this.today) return `${date} is in the past.`;
    if (daysBetween(this.today, date) > 60) return "That's more than two months out; plan closer in.";
    return null;
  }

  private async planFor(date: string): Promise<StoredPlan> {
    return this.store.ensurePlan(weekStartOf(date));
  }

  private async dinnerOn(date: string): Promise<StoredDinner | null> {
    const ds = await this.store.dinners(date, date);
    return ds.find((d) => d.status === "planned" || d.status === "cooked") ?? null;
  }

  private log(change: string) {
    this.changes.push(change);
  }

  // ---------------------------------------------------------------- tools

  async planWeekTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const weekStart = input.week_start;
    if (!isIsoDate(weekStart) || weekdayIndex(weekStart) !== 0) return { ok: false, text: "week_start must be a Monday, like 2026-11-23." };
    if (addDays(weekStart, 6) < this.today) return { ok: false, text: "That week is over." };

    // Dinners from the week before that nobody marked roll in first.
    const rolled = await rollOver(this.store, weekStart, this.today, (id) => this.catalog.find((r) => r.id === id)?.useUp ?? []);
    for (const t of rolled.carried) this.log(`Carried ${t} into the week of ${shortDate(weekStart)}`);
    for (const t of rolled.returned) this.log(`Put ${t} back in your recipes`);

    const existing = (await this.store.dinners(weekStart, addDays(weekStart, 6))).filter((d) => d.status !== "moved");
    // Nights already cooked, skipped or behind us aren't open, and neither are
    // dinners pushed here from an earlier week: they go first.
    const carried = (d: StoredDinner) => d.status === "planned" && d.pushCount > 0;
    const taken = new Set(existing.filter((d) => d.status !== "planned" || d.date < this.today || carried(d)).map((d) => d.date));

    let nights: string[];
    if (Array.isArray(input.nights) && input.nights.length) {
      const bad = input.nights.find((d) => !isIsoDate(d) || weekStartOf(d as string) !== weekStart);
      if (bad !== undefined) return { ok: false, text: `Every night must be a date in the week of ${weekStart}.` };
      nights = [...new Set(input.nights as string[])].sort();
    } else {
      // The usual nights, leaving holiday meals and leftover nights open.
      // Also travel nights from the calendar.
      const away = new Set(this.calendarIn(weekStart).filter((c) => c.kind === "away").map((c) => c.date));
      nights = defaultNights(weekStart, this.settings.dinnersPerWeek).filter((d) => !away.has(d));
    }
    nights = nights.filter((d) => d >= this.today && !taken.has(d));
    if (!nights.length) {
      if (rolled.carried.length) return { ok: true, text: `Carried over from last week, which fills the open nights: ${rolled.carried.join(", ")}.` };
      return { ok: false, text: "No open nights left in that week." };
    }
    // Planned dinners on those nights get replaced; every other dinner in the week stays.
    const replaced = existing.filter((d) => d.status === "planned" && !carried(d) && nights.includes(d.date));
    const staying = existing.filter((d) => !replaced.includes(d));

    const kidDefault = existing.filter((d) => d.sharedWithKids && d.status === "planned").length;
    const kidNights = typeof input.kid_nights === "number" ? Math.max(0, Math.round(input.kid_nights)) : kidDefault;

    const keepRefs = Array.isArray(input.keep) ? input.keep : [];
    const avoidRefs = Array.isArray(input.avoid) ? input.avoid : [];
    const keep = keepRefs.map((r) => this.recipeOf(r)?.id).filter((x): x is string => !!x);
    const avoid = avoidRefs.map((r) => this.recipeOf(r)?.id).filter((x): x is string => !!x);

    // Don't repeat what was cooked recently or is planned in the other weeks.
    const noRepeatFrom = addDays(weekStart, -7 * this.settings.noRepeatWeeks);
    const around = await this.store.dinners(addDays(weekStart, -7 * Math.max(this.settings.noRepeatWeeks, 4)), addDays(weekStart, 27));
    const recent = around
      .filter((d) => d.date >= noRepeatFrom && weekStartOf(d.date) !== weekStart && d.status !== "skipped")
      .map((d) => d.recipeId);
    // Don't pick a recipe that's already elsewhere in this week.
    const stayingRecipes = staying.filter((d) => d.status !== "skipped").map((d) => d.recipeId);
    // Stock-up items (walnuts, golden raisins) bought for the last few weeks or
    // for dinners staying this week: reusing them finishes the bag.
    const openedFrom = addDays(weekStart, -28);
    const openedRecipes = [
      ...around.filter((d) => d.date >= openedFrom && d.date < weekStart && d.status !== "skipped").map((d) => d.recipeId),
      ...stayingRecipes,
    ];
    const opened = [...new Set(openedRecipes.flatMap((id) => this.catalog.find((r) => r.id === id)?.stockUp ?? []))];

    const busy = this.calendarIn(weekStart).filter((c) => c.kind === "busy").map((c) => c.date);
    const asked = Array.isArray(input.quick) ? (input.quick as unknown[]).filter((d): d is string => isIsoDate(d)) : [];
    const quick = [...new Set([...asked, ...busy])].sort();
    const seasonal = input.seasonal !== false;

    const seed = input.reshuffle ? Math.floor(Math.random() * 1e9) : [...weekStart].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1e9;
    const result = planWeek({
      catalog: this.catalog,
      dates: nights,
      kidNights,
      keep,
      avoid: [...avoid, ...stayingRecipes],
      recent,
      opened,
      seed,
      month: seasonal ? monthOfWeek(weekStart) : undefined,
      quick,
    });
    if (!result.nights.length) return { ok: false, text: "There aren't enough recipes to plan from." };

    for (const d of replaced) await this.store.deleteDinner(d.id);
    const plan = await this.store.ensurePlan(weekStart);
    if (plan.status === "approved") await this.store.setPlanStatus(plan.id, "draft");
    const out: string[] = [];
    for (const d of existing.filter(carried)) out.push(`${this.describeDinner(d)} (carried over, not cooked last week)`);
    for (const n of result.nights) {
      const d = await this.store.addDinner({ planId: plan.id, date: n.date, recipeId: n.recipeId, sharedWithKids: n.sharedWithKids, servings: this.servings(n.sharedWithKids) });
      out.push(this.describeDinner(d));
    }
    this.log(`Drafted the week of ${shortDate(weekStart)}`);
    const holidays = holidaysInWeek(weekStart);
    const planned = result.nights.map((n) => n.date);
    const usual = defaultNights(weekStart, this.settings.dinnersPerWeek);
    const calendar = this.calendarIn(weekStart).filter((c) => (c.kind === "busy" ? planned.includes(c.date) : usual.includes(c.date) && !planned.includes(c.date)));
    this.lastDraft = { weekStart, nights: planned, kidNights, shared: result.shared, holidays, calendar };
    const openHolidays = holidays.filter(isOpenNight).map((h) => `${dayName(h.date)} (${h.name})`);
    const shared = result.shared.map((s) => `${s.name} ×${s.nights}`).join(", ") || "none";
    return {
      ok: true,
      text: [
        `Saved as a draft for the week of ${weekStart}:`,
        ...out,
        rolled.returned.length ? `Pushed twice already, so put back in the recipe library: ${rolled.returned.join(", ")}.` : "",
        `Use-up ingredients shared across nights: ${shared}.`,
        `Use-up ingredients used only once: ${result.singles.join(", ") || "none"}.`,
        `Pantry items shared (only mention if asked): ${result.pantryShared.map((s) => `${s.name} ×${s.nights}`).join(", ") || "none"}.`,
        result.stockUpReused.length ? `Finishes stock-up items bought for recent weeks: ${result.stockUpReused.join(", ")}.` : "",
        result.shortOnKidFriendly ? "Note: not enough recipes are tagged kid friendly, so some kid nights use other recipes." : "",
        openHolidays.length ? `Left open for the holiday: ${openHolidays.join(", ")}. Mention it.` : "",
        result.inSeason.length ? `In season: ${result.inSeason.join(", ")}.` : "",
        result.outOfSeason.length ? `Out of season (nothing better fit): ${result.outOfSeason.join(", ")}.` : "",
        quick.length ? (result.shortOnQuick ? "Note: not enough recipes take 30 minutes or less for every quick night." : `Quick nights (30 min or less): ${quick.join(", ")}.`) : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  async addDinnerTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const err = this.dateError(input.date);
    if (err) return { ok: false, text: err };
    const date = input.date as string;
    const recipe = this.recipeOf(input.recipe);
    if (!recipe) return { ok: false, text: "Unknown recipe ref." };
    const there = await this.dinnerOn(date);
    if (there) return { ok: false, text: `${date} already has ${this.title(there.recipeId)} (${this.dinnerRefFor(there.id)}). Use change_dinner or move_dinner.` };
    const kids = input.shared_with_kids === true;
    const plan = await this.planFor(date);
    const d = await this.store.addDinner({ planId: plan.id, date, recipeId: recipe.id, sharedWithKids: kids, servings: this.servings(kids) });
    this.log(`Added ${recipe.title} on ${dayName(date)}`);
    return { ok: true, text: `Added: ${this.describeDinner(d)}` };
  }

  async changeDinnerTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const d = await this.dinnerOf(input.dinner);
    if (!d) return { ok: false, text: "Unknown dinner ref." };
    if (d.status !== "planned") return { ok: false, text: `That dinner is ${d.status}; only planned dinners can change.` };
    const patch: { recipeId?: string; sharedWithKids?: boolean; servings?: number } = {};
    if (input.recipe !== undefined && input.recipe !== null) {
      const r = this.recipeOf(input.recipe);
      if (!r) return { ok: false, text: "Unknown recipe ref." };
      patch.recipeId = r.id;
    }
    if (typeof input.shared_with_kids === "boolean") {
      patch.sharedWithKids = input.shared_with_kids;
      patch.servings = this.servings(input.shared_with_kids);
    }
    if (!Object.keys(patch).length) return { ok: false, text: "Nothing to change." };
    await this.store.updateDinner(d.id, patch);
    const after = { ...d, ...patch };
    if (patch.recipeId) this.log(`Swapped ${dayName(d.date)} to ${this.title(patch.recipeId)}`);
    if (patch.sharedWithKids !== undefined) this.log(`${this.title(after.recipeId)} is ${patch.sharedWithKids ? "now" : "no longer"} shared with the kids`);
    return { ok: true, text: `Changed: ${this.describeDinner(after)}` };
  }

  async moveDinnerTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const d = await this.dinnerOf(input.dinner);
    if (!d) return { ok: false, text: "Unknown dinner ref." };
    if (d.status === "cooked" || d.status === "moved") return { ok: false, text: `That dinner is already ${d.status}.` };
    const err = this.dateError(input.to_date);
    if (err) return { ok: false, text: err };
    const to = input.to_date as string;
    if (to === d.date) return { ok: false, text: "It's already on that night." };
    const there = await this.dinnerOn(to);
    if (there && there.id !== d.id) {
      if (input.swap === true && d.date < this.today) return { ok: false, text: `Can't swap into ${d.date}; it's already past. Move ${this.title(there.recipeId)} elsewhere first.` };
      if (input.swap !== true || there.status !== "planned") {
        return { ok: false, text: `${to} already has ${this.title(there.recipeId)} (${this.dinnerRefFor(there.id)}). Pass swap: true to trade nights, or move that one first.` };
      }
    }
    const moveOne = async (from: StoredDinner, date: string) => {
      const plan = await this.planFor(date);
      const pushed = weekStartOf(date) > weekStartOf(from.date);
      const added = await this.store.addDinner({ planId: plan.id, date, recipeId: from.recipeId, sharedWithKids: from.sharedWithKids, servings: from.servings, pushCount: from.pushCount + (pushed ? 1 : 0) });
      await this.store.updateDinner(from.id, { status: "moved", movedTo: added.id });
      return added;
    };
    const moved = await moveOne(d, to);
    const lines = [`Moved: ${this.describeDinner(moved)}`];
    if (there && there.id !== d.id) {
      const back = await moveOne(there, d.date);
      lines.push(`Moved: ${this.describeDinner(back)}`);
      this.log(`Swapped ${this.title(d.recipeId)} and ${this.title(there.recipeId)}`);
    } else {
      const nextWeek = weekStartOf(to) !== weekStartOf(d.date);
      this.log(`Moved ${this.title(d.recipeId)} to ${nextWeek ? `${dayName(to, "short")}, ${shortDate(to)}` : dayName(to)}`);
    }
    return { ok: true, text: lines.join("\n") };
  }

  async removeDinnerTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const d = await this.dinnerOf(input.dinner);
    if (!d) return { ok: false, text: "Unknown dinner ref." };
    if (d.status !== "planned") return { ok: false, text: `That dinner is ${d.status}; mark it instead.` };
    await this.store.deleteDinner(d.id);
    this.log(`Took ${this.title(d.recipeId)} off ${dayName(d.date)}`);
    return { ok: true, text: `Removed ${this.title(d.recipeId)} from ${d.date}.` };
  }

  async markDinnerTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const d = await this.dinnerOf(input.dinner);
    if (!d) return { ok: false, text: "Unknown dinner ref." };
    const status = input.status;
    if (status !== "cooked" && status !== "skipped" && status !== "planned") return { ok: false, text: "status is cooked, skipped or planned." };
    if (d.status === "moved") return { ok: false, text: "That dinner was moved; use the new one." };
    if (status === "cooked" && d.date > this.today) return { ok: false, text: "That dinner is still ahead." };
    await this.store.updateDinner(d.id, { status });
    this.log(status === "planned" ? `Reopened ${this.title(d.recipeId)}` : `Marked ${this.title(d.recipeId)} ${status}`);
    return { ok: true, text: `Marked ${this.describeDinner({ ...d, status })}` };
  }

  async lockWeekTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const weekStart = input.week_start;
    if (!isIsoDate(weekStart) || weekdayIndex(weekStart) !== 0) return { ok: false, text: "week_start must be a Monday." };
    const [plan] = await this.store.plans(weekStart, weekStart);
    if (!plan) return { ok: false, text: "There's no plan for that week yet." };
    const locked = input.locked !== false;
    await this.store.setPlanStatus(plan.id, locked ? "approved" : "draft");
    this.log(locked ? `Locked in the week of ${shortDate(weekStart)}` : `Reopened the week of ${shortDate(weekStart)}`);
    return { ok: true, text: locked ? "Locked in." : "Back to draft." };
  }

  async recipeDetailsTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const r = this.recipeOf(input.recipe);
    if (!r) return { ok: false, text: "Unknown recipe ref." };
    const facts = await this.store.recipe(r.id);
    if (!facts) return { ok: false, text: "That recipe is gone." };
    return {
      ok: true,
      text: [
        `${facts.title} [${this.recipeRefFor(r.id)}], serves ${facts.servings}${facts.totalMinutes ? `, ${facts.totalMinutes} min` : ""}`,
        `Tags: ${facts.tags.join(", ") || "none"}${isKidFriendly(r) ? "" : " (not tagged kid friendly)"}`,
        `Use up: ${r.useUp.join(", ") || "none"}`,
        `Use over a few weeks: ${(r.stockUp ?? []).join(", ") || "none"}`,
        `Nice to share: ${(r.pantry ?? []).join(", ") || "none"}`,
        "Ingredients:",
        ...facts.ingredients.map((l) => `- ${l}`),
        `${facts.stepCount} steps.`,
      ].join("\n"),
    };
  }

  async rememberTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const body = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
    if (!body) return { ok: false, text: "note is required." };
    const category = NOTE_CATEGORIES.includes(input.category as NoteCategory) ? (input.category as NoteCategory) : "habits";
    const source = input.source === "learned" ? "learned" : "you_said";
    const note = await this.store.addNote({ body, category, source });
    this.notes.push(note);
    this.noteRef.set(`n${this.notes.length}`, note.id);
    this.log(`Remembered: ${body}`);
    return { ok: true, text: `Saved as n${this.notes.length}.` };
  }

  async forgetTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const id = typeof input.note === "string" ? this.noteRef.get(input.note.trim()) : undefined;
    const note = this.notes.find((n) => n.id === id);
    if (!note) return { ok: false, text: "Unknown note ref." };
    await this.store.forgetNote(note.id);
    this.log(`Forgot: ${note.body}`);
    return { ok: true, text: "Forgotten." };
  }

  async addRecipeFromLinkTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const url = typeof input.url === "string" ? input.url.trim() : "";
    const page = await this.fetchPage(url);
    if (!page.ok) return { ok: false, text: page.error };
    if (!page.recipe) {
      return {
        ok: false,
        text: [
          "That page has no machine-readable recipe. Here is its text; if it holds a recipe, write it up with save_recipe (source_url set to the link, photo set to the image below if there is one). If it doesn't, tell them.",
          page.image ? `Page image: ${page.image}` : "Page image: none",
          "--- page text ---",
          page.text,
        ].join("\n"),
      };
    }
    const r = page.recipe;
    return this.saveRecipe({
      title: r.title,
      sourceUrl: page.url,
      totalMinutes: r.totalMinutes,
      servings: r.servings ?? 2,
      tags: Array.isArray(input.tags) ? (input.tags as unknown[]).filter((t): t is string => typeof t === "string") : r.tags,
      ingredientLines: r.ingredientLines,
      steps: r.steps,
      perishable: Array.isArray(input.perishable) ? (input.perishable as unknown[]).filter((t): t is string => typeof t === "string") : [],
      notes: null,
      photo: r.photoUrl ? { url: r.photoUrl } : null,
    });
  }

  async saveRecipeTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const strings = (v: unknown, max: number) =>
      (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, max);
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return { ok: false, text: "title is required." };
    const steps = strings(input.steps, 40).map((body) => ({ title: null, body }));
    const ingredientLines = strings(input.ingredients, 80);
    if (!ingredientLines.length || !steps.length) return { ok: false, text: "A recipe needs ingredients and steps." };
    let photo: { bytes: Uint8Array; contentType: string } | { url: string } | null = null;
    if (input.photo === "attached") {
      if (!this.attachment) return { ok: false, text: "No photo was attached to this message." };
      photo = this.attachment;
    } else if (typeof input.photo === "string" && /^https:\/\//.test(input.photo)) {
      photo = { url: input.photo };
    }
    const minutes = typeof input.minutes === "number" && input.minutes > 0 && input.minutes <= 600 ? Math.round(input.minutes) : null;
    const servings = typeof input.servings === "number" && input.servings >= 1 && input.servings <= 24 ? Math.round(input.servings) : 2;
    const source = typeof input.source_url === "string" && /^https?:\/\//.test(input.source_url) ? input.source_url : null;
    return this.saveRecipe({
      title,
      sourceUrl: source,
      totalMinutes: minutes,
      servings,
      tags: strings(input.tags, 12).map((t) => t.toLowerCase()),
      ingredientLines,
      steps,
      perishable: strings(input.perishable, 40),
      notes: typeof input.notes === "string" ? input.notes.slice(0, 2000) : null,
      photo,
    });
  }

  private async saveRecipe(recipe: Parameters<ChefStore["createRecipe"]>[0]): Promise<ToolOutcome> {
    const saved = await this.store.createRecipe(recipe);
    if (!saved.ok) return { ok: false, text: saved.error };
    // Plan with it straight away.
    const entry: CatalogRecipe = {
      id: saved.id,
      title: saved.title,
      tags: recipe.tags,
      totalMinutes: recipe.totalMinutes,
      ...sortByTier(recipe.perishable),
    };
    this.catalog.push(entry);
    const ref = this.refRecipe(saved.id);
    this.addedRecipes.push({ id: saved.id, title: saved.title });
    this.log(`Added the recipe ${saved.title}`);
    return {
      ok: true,
      text: `Saved "${saved.title}" as ${ref} with ${recipe.ingredientLines.length} ingredients and ${recipe.steps.length} steps; ${saved.photo ? "photo saved" : "no photo"}. Tags: ${recipe.tags.join(", ") || "none"}.`,
    };
  }

  async setIngredientTierTool(input: Record<string, unknown>): Promise<ToolOutcome> {
    const name = typeof input.ingredient === "string" ? input.ingredient.trim().toLowerCase().slice(0, 80) : "";
    if (!name) return { ok: false, text: "ingredient is required." };
    if (!SHARE_TIERS.includes(input.tier as ShareTier)) return { ok: false, text: `tier must be one of ${SHARE_TIERS.join(", ")}.` };
    const tier = input.tier as ShareTier;
    const n = await this.store.setIngredientTier(name, tier);
    if (!n) return { ok: false, text: `No recipe uses "${name}". Check the spelling against recipe_details.` };
    // Reload so planning sees the change; refs stay as they were.
    this.catalog = await this.store.catalog();
    for (const r of this.catalog) if (!this.recipeRefOf.has(r.id)) this.refRecipe(r.id);
    this.log(`Treating ${name} as ${TIER_LABEL[tier]}`);
    return { ok: true, text: `${name} is now "${TIER_LABEL[tier]}" (${n} ingredient${n === 1 ? "" : "s"} updated).` };
  }

  askTool(input: Record<string, unknown>): ToolOutcome {
    const question = typeof input.question === "string" ? input.question.trim().slice(0, 200) : "";
    const choices = (Array.isArray(input.choices) ? input.choices : [])
      .filter((c): c is string => typeof c === "string" && !!c.trim())
      .map((c) => c.trim().slice(0, 40))
      .slice(0, 6);
    if (!question || choices.length < 2) return { ok: false, text: "Give a question and 2 to 6 short choices." };
    this.choice = { question, choices };
    return { ok: true, text: "The choices are shown under your reply. End your turn now; their tap comes back as their next message." };
  }
}
