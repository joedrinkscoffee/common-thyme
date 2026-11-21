"use client";

import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { deleteRecipe, saveRecipe } from "@/app/recipes/[id]/actions";
import { AMOUNT_OPTIONAL, formatAmount, parseIngredientLine, UNITS, type Unit } from "@/lib/ingredient-line";
import { LIMITS, validateRecipeEdit, type EditErrors, type RecipeEditInput } from "@/lib/recipe-edit";

/** What the page hands the editor. Plain data, so it can cross from the server. */
export type EditableRecipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  kidFriendly: boolean;
  tags: string[];
  notes: string | null;
  stepsReconstructed: boolean;
  updatedAt: string | null;
  ingredients: { quantity: number | null; unit: Unit | null; name: string | null; prep: string | null; ingredientId: string | null }[];
  steps: { title: string | null; body: string }[];
};

type Row = RecipeEditInput["ingredients"][number] & { key: number };
type StepRow = RecipeEditInput["steps"][number] & { key: number };
type Form = Omit<RecipeEditInput, "ingredients" | "steps"> & { ingredients: Row[]; steps: StepRow[] };

let nextKey = 1;
const key = () => nextKey++;

const emptyRow = (): Row => ({ key: key(), amount: "", unit: "", name: "", prep: "", ingredientId: null });

function toForm(r: EditableRecipe): Form {
  return {
    title: r.title,
    sourceUrl: r.sourceUrl ?? "",
    totalMinutes: r.totalMinutes ? String(r.totalMinutes) : "",
    servings: r.servings,
    kidFriendly: r.kidFriendly,
    tags: r.tags,
    notes: r.notes ?? "",
    stepsReconstructed: r.stepsReconstructed,
    ingredients: r.ingredients.map((i) => ({
      key: key(),
      amount: i.quantity !== null ? formatAmount(i.quantity) : "",
      unit: i.unit ?? "",
      name: i.name ?? "",
      prep: i.prep ?? "",
      ingredientId: i.ingredientId,
    })),
    steps: r.steps.map((s) => ({ key: key(), title: s.title ?? "", body: s.body })),
  };
}

function strip(f: Form): RecipeEditInput {
  return {
    ...f,
    ingredients: f.ingredients.map((r) => ({ amount: r.amount, unit: r.unit, name: r.name, prep: r.prep, ingredientId: r.ingredientId })),
    steps: f.steps.map((s) => ({ title: s.title, body: s.body })),
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const FIELD =
  "min-w-0 rounded-xl border-2 border-ink bg-paper px-3 py-2 text-ink transition-colors placeholder:text-dash hover:bg-lemon/50 focus:bg-paper focus:shadow-pop-sm focus:outline-none";
const BAD = "border-tomato bg-tomato/5";
const SMALL_BUTTON =
  "flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 border-ink bg-paper font-bold transition hover:-translate-y-0.5 hover:bg-lemon disabled:pointer-events-none disabled:opacity-30";
const ADD_BUTTON =
  "rounded-full border-2 border-dashed border-ink bg-transparent px-4 py-2 text-sm font-bold transition hover:border-solid hover:bg-lemon";

function Problem({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="m-0 mt-1 text-sm font-semibold text-tomato-dark">{text}</p>;
}

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-muted">
      {children}
    </label>
  );
}

/**
 * The recipe page in edit mode: every field at once, one Save. The photo is
 * not here; its own button on the photo saves straight away.
 */
export function RecipeEditor({
  recipe,
  knownIngredients,
  knownTags,
  upcomingDinners = 0,
  onDone,
}: {
  recipe: EditableRecipe;
  knownIngredients: string[];
  knownTags: string[];
  /** Dinners from today on that still plan this recipe; the delete step mentions them. */
  upcomingDinners?: number;
  onDone: (saved: boolean) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<Form>(() => toForm(recipe));
  const [startSnapshot] = useState(() => JSON.stringify(strip(toForm(recipe))));
  const [errors, setErrors] = useState<EditErrors>({});
  const [banner, setBanner] = useState<{ text: string; changed?: boolean } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [dragging, setDragging] = useState<{ list: "ingredients" | "steps"; index: number } | null>(null);
  const [saving, startSave] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();

  const dirty = JSON.stringify(strip(form)) !== startSnapshot;
  const editedSteps = useMemo(
    () => JSON.stringify(form.steps.map(({ title, body }) => [title, body])) !== JSON.stringify(recipe.steps.map((s) => [s.title ?? "", s.body])),
    [form.steps, recipe.steps],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRow = (n: number, patch: Partial<Row>) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((r, i) => (i === n ? { ...r, ...patch } : r)) }));
  const setStep = (n: number, patch: Partial<StepRow>) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, i) => (i === n ? { ...s, ...patch } : s)) }));

  function addTag(raw: string) {
    const tag = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, LIMITS.tag);
    setTagDraft("");
    if (!tag || form.tags.map((t) => t.toLowerCase()).includes(tag) || form.tags.length >= LIMITS.tags) return;
    set("tags", [...form.tags, tag]);
  }

  function addPasted() {
    const rows = pasted
      .split("\n")
      .map((l) => l.replace(/^\s*[-•*▢□]\s*/, "").trim())
      .filter(Boolean)
      .map((l): Row => {
        const p = parseIngredientLine(l);
        return {
          key: key(),
          amount: p.quantity !== null ? formatAmount(p.quantity) : "",
          unit: p.unit ?? "",
          name: p.name ?? "",
          prep: p.prep ?? "",
          ingredientId: null,
        };
      });
    setForm((f) => ({ ...f, ingredients: [...f.ingredients.filter((r) => r.name || r.amount || r.prep), ...rows] }));
    setPasted("");
    setPasting(false);
  }

  function save() {
    setBanner(null);
    const input = strip(form);
    const checked = validateRecipeEdit(input);
    if (!checked.ok) {
      setErrors(checked.errors);
      setBanner({ text: "A few things need fixing first. They're marked in red." });
      return;
    }
    startSave(async () => {
      const result = await saveRecipe(recipe.id, input, recipe.updatedAt);
      if (result.ok) {
        onDone(true);
        return;
      }
      setErrors(result.errors ?? {});
      setBanner({ text: result.error, changed: result.changed });
    });
  }

  function cancel() {
    if (dirty && !confirmDiscard) return setConfirmDiscard(true);
    onDone(false);
  }

  const dragProps = (list: "ingredients" | "steps", index: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragging?.list === list) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging || dragging.list !== list) return;
      setForm((f) => ({ ...f, [list]: move(f[list] as unknown[], dragging.index, index) }));
      setDragging(null);
    },
  });
  const handleProps = (list: "ingredients" | "steps", index: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      const row = (e.currentTarget as HTMLElement).closest("[data-row]");
      if (row) e.dataTransfer.setDragImage(row, 16, 16);
      setDragging({ list, index });
    },
    onDragEnd: () => setDragging(null),
  });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="pb-28"
    >
      <datalist id={`${id}-ingredients`}>
        {knownIngredients.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id={`${id}-tags`}>
        {knownTags.filter((t) => !form.tags.includes(t)).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {form.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ink py-0.5 pl-2.5 pr-1 text-[12px] font-bold text-cream">
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              onClick={() => set("tags", form.tags.filter((x) => x !== t))}
              className="flex h-5 w-5 items-center justify-center rounded-full text-cream transition hover:bg-lemon hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
        {form.tags.length < LIMITS.tags && (
          <input
            aria-label="Add a tag"
            list={`${id}-tags`}
            value={tagDraft}
            placeholder="+ add tag"
            onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value) : setTagDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagDraft);
              }
            }}
            onBlur={() => tagDraft && addTag(tagDraft)}
            className="w-28 rounded-full border-2 border-dashed border-ink bg-transparent px-2.5 py-0.5 text-[12px] font-bold transition-colors placeholder:text-muted hover:border-solid hover:bg-lemon focus:border-solid focus:bg-paper focus:outline-none"
          />
        )}
      </div>
      <Problem text={errors.tags} />

      {/* Title */}
      <div className="mt-3">
        <label htmlFor={`${id}-title`} className="sr-only">
          Recipe name
        </label>
        <input
          id={`${id}-title`}
          value={form.title}
          maxLength={LIMITS.title}
          onChange={(e) => set("title", e.target.value)}
          className={`${FIELD} w-full font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl ${errors.title ? BAD : ""}`}
        />
        <Problem text={errors.title} />
      </div>

      {/* Servings, time, kids, source */}
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor={`${id}-servings`}>Serves</Label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Fewer servings"
              disabled={form.servings <= 1}
              onClick={() => set("servings", form.servings - 1)}
              className={SMALL_BUTTON}
            >
              −
            </button>
            <input
              id={`${id}-servings`}
              inputMode="numeric"
              value={form.servings}
              onChange={(e) => set("servings", Number(e.target.value.replace(/\D/g, "")) || 0)}
              className={`${FIELD} w-14 text-center font-bold ${errors.servings ? BAD : ""}`}
            />
            <button
              type="button"
              aria-label="More servings"
              disabled={form.servings >= LIMITS.servings}
              onClick={() => set("servings", form.servings + 1)}
              className={SMALL_BUTTON}
            >
              +
            </button>
          </div>
          <Problem text={errors.servings} />
        </div>
        <div>
          <Label htmlFor={`${id}-minutes`}>Time</Label>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-minutes`}
              inputMode="numeric"
              value={form.totalMinutes}
              placeholder="30"
              onChange={(e) => set("totalMinutes", e.target.value.replace(/[^\d]/g, ""))}
              className={`${FIELD} w-20 text-center font-bold ${errors.totalMinutes ? BAD : ""}`}
            />
            <span className="font-semibold text-muted">min</span>
          </div>
          <Problem text={errors.totalMinutes} />
        </div>
        <button
          type="button"
          aria-pressed={form.kidFriendly}
          onClick={() => set("kidFriendly", !form.kidFriendly)}
          className={`rounded-full border-2 border-ink px-3.5 py-2 text-sm font-bold transition hover:-translate-y-0.5 ${
            form.kidFriendly ? "-rotate-1 bg-lemon shadow-pop-sm" : "bg-paper hover:bg-lemon"
          }`}
        >
          {form.kidFriendly ? "✓ Kid friendly" : "Kid friendly?"}
        </button>
      </div>
      <div className="mt-4">
        <Label htmlFor={`${id}-source`}>Source link (optional)</Label>
        <input
          id={`${id}-source`}
          type="url"
          inputMode="url"
          value={form.sourceUrl}
          placeholder="https://"
          onChange={(e) => set("sourceUrl", e.target.value)}
          className={`${FIELD} w-full ${errors.sourceUrl ? BAD : ""}`}
        />
        <Problem text={errors.sourceUrl} />
      </div>

      {/* Ingredients */}
      <h2 className="mb-1 mt-8 font-display text-2xl font-extrabold">Ingredients</h2>
      <p className="mb-3 mt-0 text-sm text-muted">
        Keep the ingredient plain (&ldquo;carrot&rdquo;) and put how it&rsquo;s cut in prep (&ldquo;shredded&rdquo;). That&rsquo;s how Chef
        spots ingredients you can share across the week.
      </p>
      <div className="mb-1 hidden gap-2 text-xs font-extrabold uppercase tracking-wide text-muted md:flex">
        <span className="w-9 flex-none" />
        <span className="w-[76px] flex-none">Amount</span>
        <span className="w-[116px] flex-none">Unit</span>
        <span className="flex-[2_1_0]">Ingredient</span>
        <span className="flex-[1.4_1_0]">Prep</span>
        <span className="w-9 flex-none" />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {form.ingredients.map((row, n) => {
          const e = (f: string) => errors[`ingredients.${n}.${f}`];
          const rowBad = e("amount") || e("unit") || e("name") || e("prep");
          return (
            <li
              key={row.key}
              data-row
              {...dragProps("ingredients", n)}
              className={`rounded-2xl border-2 p-2 transition-colors md:border-0 md:p-0 ${rowBad ? "border-tomato" : "border-line"} ${
                dragging?.list === "ingredients" && dragging.index === n ? "opacity-40" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
                <div
                  {...handleProps("ingredients", n)}
                  title="Drag to reorder"
                  className="flex w-9 flex-none cursor-grab flex-col items-center justify-center rounded-xl text-muted active:cursor-grabbing"
                >
                  <button
                    type="button"
                    aria-label={`Move ${row.name || "ingredient"} up`}
                    disabled={n === 0}
                    onClick={() => set("ingredients", move(form.ingredients, n, n - 1))}
                    className="flex h-[18px] w-9 items-center justify-center rounded-md text-xs transition hover:bg-lemon hover:text-ink disabled:opacity-25"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${row.name || "ingredient"} down`}
                    disabled={n === form.ingredients.length - 1}
                    onClick={() => set("ingredients", move(form.ingredients, n, n + 1))}
                    className="flex h-[18px] w-9 items-center justify-center rounded-md text-xs transition hover:bg-lemon hover:text-ink disabled:opacity-25"
                  >
                    ▼
                  </button>
                </div>
                <input
                  aria-label="Amount"
                  inputMode="decimal"
                  placeholder={AMOUNT_OPTIONAL.includes(row.unit as Unit) ? "—" : "1"}
                  value={row.amount}
                  onChange={(ev) => setRow(n, { amount: ev.target.value })}
                  className={`${FIELD} w-[76px] flex-none px-2 text-center font-bold ${e("amount") ? BAD : ""}`}
                />
                <select
                  aria-label="Unit"
                  value={row.unit}
                  onChange={(ev) => setRow(n, { unit: ev.target.value })}
                  className={`${FIELD} w-[116px] flex-none px-2 ${e("unit") ? BAD : ""} ${row.unit ? "" : "text-muted"}`}
                >
                  <option value="">unit…</option>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Ingredient"
                  list={`${id}-ingredients`}
                  placeholder={n === 0 ? "e.g. carrot" : "ingredient"}
                  value={row.name}
                  maxLength={LIMITS.ingredientName}
                  onChange={(ev) => setRow(n, { name: ev.target.value, ingredientId: null })}
                  className={`${FIELD} order-last w-full font-semibold md:order-none md:w-auto md:flex-[2_1_0] ${e("name") ? BAD : ""}`}
                />
                <input
                  aria-label="Prep"
                  placeholder={n === 0 ? "e.g. shredded" : "optional"}
                  value={row.prep}
                  maxLength={LIMITS.prep}
                  onChange={(ev) => setRow(n, { prep: ev.target.value })}
                  className={`${FIELD} order-last w-full italic md:order-none md:w-auto md:flex-[1.4_1_0] ${e("prep") ? BAD : ""}`}
                />
                <button
                  type="button"
                  aria-label={`Remove ${row.name || "this ingredient"}`}
                  onClick={() => set("ingredients", form.ingredients.filter((_, i) => i !== n))}
                  className={`${SMALL_BUTTON} ml-auto hover:bg-tomato hover:text-white md:ml-0`}
                >
                  ×
                </button>
              </div>
              {rowBad && (
                <p className="m-0 mt-1 text-sm font-semibold text-tomato-dark md:pl-[44px]">
                  {[e("amount"), e("unit"), e("name"), e("prep")].filter(Boolean).join(" ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <Problem text={errors.ingredients} />
      {pasting ? (
        <div className="mt-3 rounded-2xl border-2 border-ink bg-sand p-3">
          <Label htmlFor={`${id}-paste`}>Paste ingredients, one per line</Label>
          <textarea
            id={`${id}-paste`}
            rows={5}
            value={pasted}
            autoFocus
            placeholder={"1 shredded carrot\n2 tbsp olive oil\nSalt to taste"}
            onChange={(e) => setPasted(e.target.value)}
            className={`${FIELD} w-full`}
          />
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={addPasted} disabled={!pasted.trim()} className="rounded-full border-2 border-ink bg-ink px-4 py-2 text-sm font-bold text-cream transition hover:-translate-y-0.5 hover:bg-ink-soft disabled:opacity-50">
              Add these
            </button>
            <button type="button" onClick={() => setPasting(false)} className="rounded-full px-4 py-2 text-sm font-bold transition hover:bg-lemon">
              Never mind
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => set("ingredients", [...form.ingredients, emptyRow()])} className={ADD_BUTTON}>
            + Add ingredient
          </button>
          <button type="button" onClick={() => setPasting(true)} className={ADD_BUTTON}>
            Paste a list
          </button>
        </div>
      )}

      {/* Steps */}
      <h2 className="mb-3 mt-8 font-display text-2xl font-extrabold">Steps</h2>
      {recipe.stepsReconstructed && (
        <label className="mb-4 flex -rotate-1 cursor-pointer items-start gap-2 rounded-xl border-2 border-ink bg-lemon px-3 py-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={!form.stepsReconstructed}
            onChange={(e) => set("stepsReconstructed", !e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-ink"
          />
          <span>
            Chef rebuilt these steps because the original page is gone.{" "}
            {editedSteps ? "Tick this if they're right now." : "Tick this once you've checked them."}
          </span>
        </label>
      )}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {form.steps.map((s, n) => (
          <li
            key={s.key}
            data-row
            {...dragProps("steps", n)}
            className={`flex gap-3 rounded-2xl border-2 bg-paper p-3 ${errors[`steps.${n}`] || errors[`steps.${n}.title`] ? "border-tomato" : "border-ink"} ${
              dragging?.list === "steps" && dragging.index === n ? "opacity-40" : ""
            }`}
          >
            <div className="flex flex-none flex-col items-center gap-1.5">
              <span
                {...handleProps("steps", n)}
                title="Drag to reorder"
                className="flex h-8 w-8 cursor-grab items-center justify-center rounded-full bg-tomato font-bold text-white active:cursor-grabbing"
              >
                {n + 1}
              </span>
              <button type="button" aria-label={`Move step ${n + 1} up`} disabled={n === 0} onClick={() => set("steps", move(form.steps, n, n - 1))} className={SMALL_BUTTON}>
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move step ${n + 1} down`}
                disabled={n === form.steps.length - 1}
                onClick={() => set("steps", move(form.steps, n, n + 1))}
                className={SMALL_BUTTON}
              >
                ↓
              </button>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                aria-label={`Step ${n + 1} title (optional)`}
                placeholder="Title (optional)"
                value={s.title}
                maxLength={LIMITS.stepTitle}
                onChange={(e) => setStep(n, { title: e.target.value })}
                className={`${FIELD} w-full font-display font-extrabold`}
              />
              <textarea
                aria-label={`Step ${n + 1}`}
                rows={3}
                value={s.body}
                placeholder="What to do"
                onChange={(e) => setStep(n, { body: e.target.value })}
                className={`${FIELD} w-full leading-relaxed ${errors[`steps.${n}`] ? BAD : ""}`}
              />
              <Problem text={errors[`steps.${n}`] ?? errors[`steps.${n}.title`]} />
            </div>
            <button
              type="button"
              aria-label={`Remove step ${n + 1}`}
              onClick={() => set("steps", form.steps.filter((_, i) => i !== n))}
              className={`${SMALL_BUTTON} hover:bg-tomato hover:text-white`}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <Problem text={errors.steps} />
      <button type="button" onClick={() => set("steps", [...form.steps, { key: key(), title: "", body: "" }])} className={`${ADD_BUTTON} mt-3`}>
        + Add step
      </button>

      {/* Notes */}
      <div className="mt-8">
        <Label htmlFor={`${id}-notes`}>Notes (optional)</Label>
        <textarea
          id={`${id}-notes`}
          rows={3}
          value={form.notes}
          placeholder="Swaps, tips, what the kids thought…"
          onChange={(e) => set("notes", e.target.value)}
          className={`${FIELD} w-full ${errors.notes ? BAD : ""}`}
        />
        <Problem text={errors.notes} />
      </div>

      {/* Delete */}
      <div className="mt-10 border-t-2 border-dashed border-dash pt-6">
        {confirmDelete ? (
          <div role="alertdialog" aria-labelledby={`${id}-delete-q`} className="rounded-2xl border-2 border-ink bg-paper p-4 shadow-pop-sm">
            <p id={`${id}-delete-q`} className="m-0 font-display text-lg font-extrabold">
              Delete &ldquo;{recipe.title}&rdquo;?
            </p>
            <p className="mb-3 mt-1 text-sm leading-relaxed text-muted">
              It leaves your recipes and Chef stops suggesting it. Past weeks still show it, and you can undo right after.
              {upcomingDinners > 0 &&
                ` It's planned for ${upcomingDinners === 1 ? "an upcoming dinner" : `${upcomingDinners} upcoming dinners`}, which stay on the plan until you change them.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold transition hover:-translate-y-0.5 hover:bg-lemon"
              >
                Keep it
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() =>
                  startDelete(async () => {
                    setDeleteError(null);
                    const r = await deleteRecipe(recipe.id);
                    if (!r.ok) return setDeleteError(r.error ?? "Couldn't delete the recipe.");
                    router.push(`/recipes?deleted=${recipe.id}`);
                  })
                }
                className="rounded-full border-2 border-ink bg-tomato px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-tomato-dark disabled:cursor-wait disabled:opacity-80"
              >
                {deleting ? "Deleting…" : "Delete recipe"}
              </button>
            </div>
            <Problem text={deleteError ?? undefined} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded-full border-2 border-tomato bg-transparent px-4 py-2 text-sm font-bold text-tomato-dark transition hover:-translate-y-0.5 hover:bg-tomato hover:text-white"
          >
            Delete recipe
          </button>
        )}
      </div>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-cream/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6">
          <p role="status" className="m-0 mr-auto text-sm font-semibold">
            {banner ? (
              <span className="text-tomato-dark">
                {banner.text}{" "}
                {banner.changed && (
                  <button type="button" onClick={() => window.location.reload()} className="font-bold text-ink underline hover:bg-lemon">
                    Reload
                  </button>
                )}
              </span>
            ) : confirmDiscard ? (
              "Throw away your changes?"
            ) : dirty ? (
              <span className="text-muted">Unsaved changes</span>
            ) : (
              <span className="text-muted">Editing</span>
            )}
          </p>
          {confirmDiscard ? (
            <>
              <button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-full border-2 border-ink bg-paper px-4 py-2 font-bold transition hover:-translate-y-0.5 hover:bg-lemon">
                Keep editing
              </button>
              <button type="button" onClick={() => onDone(false)} className="rounded-full border-2 border-ink bg-ink px-4 py-2 font-bold text-cream transition hover:-translate-y-0.5 hover:bg-ink-soft">
                Discard
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={cancel} className="rounded-full border-2 border-ink bg-paper px-4 py-2 font-bold transition hover:-translate-y-0.5 hover:bg-lemon">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full border-2 border-ink bg-tomato px-5 py-2 font-bold text-white shadow-pop-sm transition hover:-translate-y-0.5 hover:bg-tomato-dark disabled:cursor-wait disabled:opacity-80"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
