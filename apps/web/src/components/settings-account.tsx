"use client";

import { useState, useTransition } from "react";
import { deleteAccount, saveEmailPrefs } from "@/app/settings/actions";
import { SettingsCard } from "@/components/settings-card";

export type AccountView = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  thursday: boolean;
  sunday: boolean;
  isAdmin: boolean;
  household: { name: string; recipeCount: number; others: string[] } | null;
  sample: boolean;
};

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-sand px-4 py-3">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span className="relative inline-flex flex-none items-center">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="h-8 w-14 rounded-full border-2 border-ink bg-paper transition-colors peer-checked:bg-caper peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-tomato peer-disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 h-6 w-6 rounded-full border-2 border-ink bg-ink transition-transform peer-checked:translate-x-6 motion-reduce:transition-none"
        />
      </span>
    </label>
  );
}

function zoneLabel(tz: string | null) {
  if (!tz) return null;
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    return name ?? tz.replace(/_/g, " ");
  } catch {
    return tz.replace(/_/g, " ");
  }
}

function EmailPrefs({ view }: { view: AccountView }) {
  const [prefs, setPrefs] = useState({ thursday: view.thursday, sunday: view.sunday });
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  function set(next: typeof prefs) {
    const before = prefs;
    setPrefs(next);
    setNote(null);
    start(async () => {
      const r = await saveEmailPrefs(next);
      if (r.ok) setNote({ ok: true, text: "Saved." });
      else {
        setPrefs(before);
        setNote({ ok: false, text: r.error });
      }
    });
  }
  const zone = zoneLabel(view.timezone);
  return (
    <SettingsCard
      title="Check-in emails"
      hint={<>Chef asks what you cooked, so next week&apos;s plan uses up what&apos;s left. Only sent when meals are still unmarked.{zone && <> Times are in your time zone, {zone}.</>}</>}
    >
      <div className="flex flex-col gap-2">
        <Switch label="Thursday evening" hint="7 PM, for Monday to Thursday" checked={prefs.thursday} disabled={pending} onChange={(v) => set({ ...prefs, thursday: v })} />
        <Switch label="Sunday morning" hint="9 AM, for the rest of the week" checked={prefs.sunday} disabled={pending} onChange={(v) => set({ ...prefs, sunday: v })} />
      </div>
      <p role="status" className={`mb-0 mt-2 text-sm empty:hidden ${note?.ok === false ? "text-tomato-dark" : "text-muted"}`}>
        {note?.text}
      </p>
    </SettingsCard>
  );
}

function DeleteAccount({ view }: { view: AccountView }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const h = view.household;
  const recipes = h ? `${h.recipeCount} ${h.recipeCount === 1 ? "recipe" : "recipes"}` : "";
  const others = h?.others.join(" and ");

  if (view.isAdmin) {
    return (
      <SettingsCard title="Delete account" tone="danger" hint="You're an admin of Common Thyme, so this account can't be deleted from here.">
        <p className="m-0 text-[15px] text-muted">Remove your admin flag in the database first, then come back.</p>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard title="Delete account" tone="danger" hint="Deletes your account and sign-in for good. This can't be undone.">
      <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0 text-[15px]">
        {h && h.others.length > 0 ? (
          <>
            <li className="rounded-2xl bg-sand px-4 py-2.5">
              <strong>{h.name}</strong> stays with {others}. They keep all {recipes}, your meal plans and the chat with Chef.
            </li>
            <li className="rounded-2xl bg-sand px-4 py-2.5">If you set up the household, {h.others[0]} takes it over.</li>
          </>
        ) : h ? (
          <li className="rounded-2xl bg-sand px-4 py-2.5">
            You&apos;re the only one in <strong>{h.name}</strong>, so it&apos;s deleted too: {recipes} and their photos, every meal plan, grocery list and the chat with Chef.
          </li>
        ) : null}
        <li className="rounded-2xl bg-sand px-4 py-2.5">You come off the invite list. To come back later you&apos;d need a new invite.</li>
      </ul>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-full border-2 border-tomato bg-paper px-5 font-bold text-tomato-dark transition-colors hover:bg-tomato hover:text-white"
        >
          Delete my account…
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await deleteAccount(typed);
              if (r && !r.ok) setError(r.error);
            });
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="confirm-delete" className="text-[15px] font-semibold">
            Type <span className="rounded-md bg-sand px-1.5 font-mono">delete</span> to confirm
          </label>
          <input
            id="confirm-delete"
            value={typed}
            autoComplete="off"
            autoCapitalize="off"
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-11 w-full rounded-xl border-2 border-ink bg-paper px-3 text-ink focus:shadow-pop-sm focus:outline-none"
          />
          {error && (
            <p role="alert" className="m-0 text-sm font-semibold text-tomato-dark">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || typed.trim().toLowerCase() !== "delete" || view.sample}
              className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:bg-tomato-dark disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete for good"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="min-h-11 rounded-full border-2 border-ink bg-paper px-5 font-bold transition-colors hover:bg-lemon"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </SettingsCard>
  );
}

export function AccountSettings({ view }: { view: AccountView }) {
  return (
    <>
      <SettingsCard title="You">
        <div className="flex flex-wrap items-center gap-4">
          {view.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-14 w-14 flex-none rounded-full border-2 border-ink object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-14 w-14 flex-none place-items-center rounded-full border-2 border-ink bg-lemon font-display text-2xl font-extrabold">
              {view.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-lg font-bold">{view.name}</p>
            {view.email && <p className="m-0 truncate text-muted">{view.email}</p>}
            <p className="m-0 text-sm text-muted">Signed in with Google</p>
          </div>
          <form action="/auth/sign-out" method="post" className="w-full sm:w-auto">
            <button
              type="submit"
              className="min-h-11 w-full rounded-full border-2 border-ink bg-paper px-5 font-bold shadow-pop-sm transition-[background-color,translate,box-shadow] hover:bg-lemon active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 sm:w-auto"
            >
              Sign out
            </button>
          </form>
        </div>
      </SettingsCard>
      <EmailPrefs view={view} />
      <DeleteAccount view={view} />
    </>
  );
}
