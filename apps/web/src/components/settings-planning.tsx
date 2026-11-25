"use client";

import { useState, useTransition } from "react";
import { addPreference, forgetPreference, savePlanning, type PlanningInput, type Result } from "@/app/settings/actions";
import { SettingsCard } from "@/components/settings-card";
import { timeZoneOptions } from "@/lib/settings-shared";

export type Preference = { id: string; body: string };

function Stepper({ label, hint, value, min, max, onChange, unit }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void; unit?: (n: number) => string }) {
  const btn =
    "grid h-11 w-11 flex-none place-items-center rounded-full border-2 border-ink bg-paper text-lg font-bold transition-colors hover:bg-lemon disabled:opacity-40 disabled:hover:bg-paper";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-3">
      <div className="min-w-0">
        <p className="m-0 font-semibold">{label}</p>
        {hint && <p className="m-0 text-sm text-muted">{hint}</p>}
      </div>
      <div className="flex flex-none items-center gap-1" role="group" aria-label={label}>
        <button type="button" className={btn} aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite" className="min-w-[2.75rem] text-center font-display text-lg font-extrabold">
          {unit ? unit(value) : value}
        </output>
        <button type="button" className={btn} aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

function HowChefPlans({ initial, sample }: { initial: PlanningInput; sample: boolean }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (patch: Partial<PlanningInput>) => {
    setV({ ...v, ...patch });
    setNote(null);
  };
  return (
    <SettingsCard title="How Chef plans" hint="Chef starts each week from these. You can always ask for something different in the chat.">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await savePlanning(v);
            if (r.ok) setSaved(v);
            setNote(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
          });
        }}
      >
        <Stepper label="Meals a week" hint="Usually weeknight dinners" value={v.mealsPerWeek} min={1} max={7} onChange={(n) => set({ mealsPerWeek: n })} />
        <Stepper label="Servings per meal" value={v.baseServings} min={1} max={12} onChange={(n) => set({ baseServings: n })} />
        <Stepper
          label="Extra when shared with kids"
          hint="Added to meals you share with the kids"
          value={v.kidsExtraServings}
          min={0}
          max={12}
          onChange={(n) => set({ kidsExtraServings: n })}
          unit={(n) => `+${n}`}
        />
        <Stepper
          label="Don't repeat a recipe for"
          value={v.noRepeatWeeks}
          min={0}
          max={12}
          onChange={(n) => set({ noRepeatWeeks: n })}
          unit={(n) => (n === 0 ? "Off" : `${n} wk`)}
        />
        <label className="flex flex-col gap-1.5 rounded-2xl bg-sand px-4 py-3">
          <span className="font-semibold">Household time zone</span>
          <span className="text-sm text-muted">Decides what &ldquo;today&rdquo; and &ldquo;this week&rdquo; mean for Chef.</span>
          <select
            value={v.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className="mt-1 min-h-11 w-full rounded-xl border-2 border-ink bg-paper px-3 text-ink focus:shadow-pop-sm focus:outline-none"
          >
            {timeZoneOptions(v.timezone).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !dirty || sample}
            className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <p role="status" className={`m-0 text-sm ${note?.ok === false ? "font-semibold text-tomato-dark" : "text-muted"}`}>
            {note?.text}
          </p>
        </div>
      </form>
    </SettingsCard>
  );
}

function FoodPreferences({ initial, sample }: { initial: Preference[]; sample: boolean }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) after?.();
    });
  return (
    <SettingsCard title="Food preferences" hint="Diets, allergies and things you don't eat. Chef plans around them every week.">
      {initial.length > 0 && (
        <ul className="m-0 mb-3 flex list-none flex-col gap-2 p-0">
          {initial.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-2">
              <span>{p.body}</span>
              <button
                type="button"
                disabled={pending || sample}
                onClick={() => run(() => forgetPreference(p.id))}
                className="min-h-11 flex-none rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addPreference(text), () => setText(""));
        }}
      >
        <label htmlFor="new-preference" className="sr-only">
          Add a food preference
        </label>
        <input
          id="new-preference"
          value={text}
          maxLength={200}
          placeholder="e.g. No shellfish for Sam"
          onChange={(e) => setText(e.target.value)}
          className="min-h-11 min-w-0 flex-1 basis-56 rounded-xl border-2 border-ink bg-paper px-3 text-ink placeholder:text-muted focus:shadow-pop-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !text.trim() || sample}
          className="min-h-11 rounded-full border-2 border-ink bg-lemon px-5 font-bold shadow-pop-sm transition-[background-color,translate,box-shadow] hover:bg-caper active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        >
          Add
        </button>
      </form>
      <p role="status" className={`mb-0 mt-2 text-sm empty:hidden ${note?.ok === false ? "font-semibold text-tomato-dark" : "text-muted"}`}>
        {note?.text}
      </p>
    </SettingsCard>
  );
}

export function PlanningSettings({ planning, preferences, sample }: { planning: PlanningInput; preferences: Preference[]; sample: boolean }) {
  return (
    <>
      <HowChefPlans initial={planning} sample={sample} />
      <FoodPreferences initial={preferences} sample={sample} />
    </>
  );
}
