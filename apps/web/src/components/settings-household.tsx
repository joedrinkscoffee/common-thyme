"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/app/actions";
import { leaveHousehold, removeMember, renameHousehold, revokeInvite, type Result } from "@/app/settings/actions";
import { SettingsCard } from "@/components/settings-card";

export type MemberView = { userId: string; name: string; avatarUrl: string | null; role: "owner" | "member"; joinedAt: string; isYou: boolean };
export type PendingInvite = { id: string; expiresAt: string };
export type HouseholdView = { name: string; members: MemberView[]; invites: PendingInvite[]; youOwn: boolean; sample: boolean };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Status({ note }: { note: { ok: boolean; text: string } | null }) {
  return (
    <p role="status" className={`mb-0 mt-2 text-sm empty:hidden ${note?.ok === false ? "font-semibold text-tomato-dark" : "text-muted"}`}>
      {note?.text}
    </p>
  );
}

function useAction() {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  function run(fn: () => Promise<Result | void>, after?: () => void) {
    setNote(null);
    start(async () => {
      const r = await fn();
      if (!r) return;
      setNote(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) after?.();
    });
  }
  return { note, pending, run };
}

function Name({ view }: { view: HouseholdView }) {
  const [name, setName] = useState(view.name);
  const { note, pending, run } = useAction();
  return (
    <SettingsCard title="Household name" hint="Shown to everyone in the household.">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => renameHousehold(name));
        }}
      >
        <label htmlFor="household-name" className="sr-only">
          Household name
        </label>
        <input
          id="household-name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11 min-w-0 flex-1 basis-48 rounded-xl border-2 border-ink bg-paper px-3 text-ink focus:shadow-pop-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !name.trim() || name.trim() === view.name || view.sample}
          className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <Status note={note} />
    </SettingsCard>
  );
}

function Avatar({ m }: { m: MemberView }) {
  return m.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-10 flex-none rounded-full border-2 border-ink object-cover" />
  ) : (
    <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-ink bg-kale font-display text-lg font-extrabold">
      {m.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Members({ view }: { view: HouseholdView }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const { note, pending, run } = useAction();
  const alone = view.members.length < 2;
  return (
    <SettingsCard title="Members" hint="Everyone here shares the recipes, meal plans, grocery list and chat with Chef.">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {view.members.map((m) => (
          <li key={m.userId} className="rounded-2xl bg-sand px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar m={m} />
              <div className="min-w-0 flex-1">
                <p className="m-0 flex flex-wrap items-center gap-2 font-semibold">
                  <span className="truncate">{m.name}</span>
                  {m.isYou && <span className="text-sm font-medium text-muted">(you)</span>}
                  {m.role === "owner" && <span className="rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">owner</span>}
                </p>
                <p className="m-0 text-sm text-muted">Joined {day(m.joinedAt)}</p>
              </div>
              {view.youOwn && !m.isYou && confirming !== m.userId && (
                <button
                  type="button"
                  onClick={() => setConfirming(m.userId)}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink"
                >
                  Remove
                </button>
              )}
            </div>
            {confirming === m.userId && (
              <div className="mt-3 border-t-2 border-dashed border-dash pt-3">
                <p className="m-0 mb-2 text-[15px]">
                  Remove {m.name}? They lose access to this household&apos;s recipes and plans. Their account stays, and you can invite them again.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending || view.sample}
                    onClick={() => run(() => removeMember(m.userId), () => setConfirming(null))}
                    className="min-h-11 rounded-full bg-tomato px-4 font-bold text-white transition hover:bg-tomato-dark disabled:opacity-50"
                  >
                    {pending ? "Removing…" : `Remove ${m.name}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Status note={note} />
      {!alone && <Leave view={view} />}
    </SettingsCard>
  );
}

function Leave({ view }: { view: HouseholdView }) {
  const [open, setOpen] = useState(false);
  const { note, pending, run } = useAction();
  const heir = view.members.filter((m) => !m.isYou).sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-11 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink">
        Leave this household…
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-2xl border-2 border-dashed border-dash p-4">
      <p className="m-0 mb-2 text-[15px]">
        The recipes and plans stay with {heir?.name ?? "the others"}
        {view.youOwn && heir ? `, who becomes the owner` : ""}. You&apos;ll start fresh with a new household of your own.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || view.sample}
          onClick={() => run(() => leaveHousehold())}
          className="min-h-11 rounded-full bg-tomato px-4 font-bold text-white transition hover:bg-tomato-dark disabled:opacity-50"
        >
          {pending ? "Leaving…" : "Leave household"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon">
          Cancel
        </button>
      </div>
      <Status note={note} />
    </div>
  );
}

function Invite({ view }: { view: HouseholdView }) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const revoke = useAction();

  function make() {
    setNote(null);
    start(async () => {
      const r = await createInvite();
      if (!r?.inviteUrl) {
        setNote({ ok: false, text: r?.error ?? "Couldn't make a link. Try again?" });
        return;
      }
      setUrl(r.inviteUrl);
      setNote({ ok: true, text: "New link ready. It works once and lasts 14 days." });
    });
  }

  async function share() {
    if (!url) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join our household on Common Thyme", url });
        return;
      } catch {
        // fall back to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote({ ok: true, text: "Copied. Send it to them however you like." });
    } catch {
      setNote({ ok: true, text: "Copy the link above and send it to them." });
    }
  }

  return (
    <SettingsCard
      title="Invite someone to your household"
      hint="For a partner or someone you cook with. They sign in with Google and see everything here. Each link works for one person."
    >
      {url ? (
        <div className="flex flex-col gap-2">
          <input
            readOnly
            value={url}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded-xl border-2 border-dash bg-cream px-3 text-sm text-ink"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={share} className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5">
              Send link
            </button>
            <button type="button" onClick={make} disabled={pending} className="min-h-11 rounded-full border-2 border-ink bg-paper px-5 font-bold transition-colors hover:bg-lemon disabled:opacity-50">
              Make another
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={make}
          disabled={pending || view.sample}
          className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {pending ? "Making a link…" : "Make an invite link"}
        </button>
      )}
      <Status note={note} />

      {view.invites.length > 0 && (
        <div className="mt-2 border-t-2 border-dashed border-dash pt-3">
          <h3 className="m-0 mb-2 text-sm font-extrabold uppercase tracking-wide text-muted">Links not used yet</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {view.invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-2">
                <span className="text-[15px]">Works until {day(inv.expiresAt)}</span>
                <button
                  type="button"
                  disabled={revoke.pending || view.sample}
                  onClick={() => revoke.run(() => revokeInvite(inv.id))}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink disabled:opacity-50"
                >
                  Turn off
                </button>
              </li>
            ))}
          </ul>
          <Status note={revoke.note} />
        </div>
      )}
    </SettingsCard>
  );
}

export function HouseholdSettings({ view }: { view: HouseholdView }) {
  return (
    <>
      <Members view={view} />
      <Invite view={view} />
      <Name view={view} />
    </>
  );
}
