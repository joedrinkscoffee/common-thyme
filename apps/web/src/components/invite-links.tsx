"use client";

import { useState, useTransition } from "react";
import { createAccessLink, removeAccess, revokeAccessLink } from "@/app/admin/actions";
import type { LinkState } from "@/lib/access-links";

export type LinkRow = { id: string; url: string; label: string | null; maxUses: number; useCount: number; expiresAt: string; state: LinkState };
export type AccessRow = { email: string; via: string; at: string; isYou: boolean };

const PEOPLE = [
  { value: 1, label: "One person" },
  { value: 5, label: "Up to 5" },
  { value: 25, label: "Up to 25" },
];
const DAYS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

const STATE_LABEL: Record<LinkState, string> = { open: "Open", used: "Used up", expired: "Expired", invalid: "Revoked" };
const STATE_CLASS: Record<LinkState, string> = {
  open: "bg-caper",
  used: "bg-sand",
  expired: "bg-sand",
  invalid: "bg-sand",
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Segmented<T extends number>({ name, options, value, onChange }: { name: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 text-sm font-semibold">{name}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={[
              "min-h-[44px] rounded-full border-2 px-4 text-sm font-semibold transition-colors",
              value === o.value ? "border-ink bg-ink text-cream" : "border-dash bg-paper text-ink hover:border-ink hover:bg-lemon",
            ].join(" ")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CopyLink({ url, big = false }: { url: string; big?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    // On phones, open the share sheet (Messages, WhatsApp…); otherwise copy.
    if (big && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Join me on Common Thyme", url });
        return;
      } catch {
        // fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className={[
        "shrink-0 rounded-full border-2 border-ink font-bold transition-colors hover:bg-lemon",
        big ? "min-h-[52px] bg-lemon px-6 shadow-pop-sm" : "min-h-[40px] bg-paper px-4 text-sm",
      ].join(" ")}
    >
      {copied ? "Copied" : big ? "Copy or share" : "Copy"}
    </button>
  );
}

export function InviteLinks({ links, people }: { links: LinkRow[]; people: AccessRow[] }) {
  const [label, setLabel] = useState("");
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(14);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  function make(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await createAccessLink({ label, people: count, days });
      if (result.ok) {
        setMade(result.url);
        setLabel("");
      } else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[22px] border-2 border-ink bg-paper p-5 shadow-pop-lg sm:p-6">
        <h2 className="m-0 font-display text-2xl font-extrabold">New invite link</h2>
        <form onSubmit={make} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Who&apos;s it for? (just for you)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="Sam and Alex"
              className="min-h-[48px] rounded-xl border-2 border-dash bg-paper px-4 text-base focus:border-ink"
            />
          </label>
          <Segmented name="Lets in" options={PEOPLE} value={count} onChange={setCount} />
          <Segmented name="Works for" options={DAYS} value={days} onChange={setDays} />
          <button type="submit" disabled={pending} className="min-h-[52px] rounded-full bg-tomato px-6 font-bold text-white hover:bg-tomato-dark disabled:opacity-60">
            {pending ? "Making a link…" : "Make a link"}
          </button>
          {error && (
            <p role="status" className="m-0 text-sm text-tomato-dark">
              {error}
            </p>
          )}
        </form>
        {made && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-4">
            <div className="text-sm font-semibold">Your link is ready. Send it to them:</div>
            <input
              readOnly
              value={made}
              aria-label="New invite link"
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-full border-2 border-dash bg-paper px-4 py-2.5 text-sm text-ink"
            />
            <CopyLink url={made} big />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 mt-0 font-display text-2xl font-extrabold">Links</h2>
        {links.length === 0 ? (
          <p className="m-0 text-muted">No links yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {links.map((l) => (
              <li key={l.id} className={["rounded-2xl border-2 bg-paper p-4", l.state === "open" ? "border-ink" : "border-line text-muted"].join(" ")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{l.label ?? "Invite link"}</span>
                  <span className={`rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold text-ink ${STATE_CLASS[l.state]}`}>{STATE_LABEL[l.state]}</span>
                </div>
                <div className="mt-1 text-sm" suppressHydrationWarning>
                  {l.useCount} of {l.maxUses} joined
                  {l.state === "open" && <> · works until {day(l.expiresAt)}</>}
                </div>
                {l.state === "open" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <CopyLink url={l.url} />
                    <button
                      type="button"
                      onClick={() => start(() => revokeAccessLink(l.id))}
                      className="min-h-[40px] rounded-full px-4 text-sm font-semibold text-muted hover:bg-lemon hover:text-ink"
                    >
                      Turn off
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 mt-0 font-display text-2xl font-extrabold">Who&apos;s in ({people.length})</h2>
        <p className="mb-3 mt-0 text-sm text-muted">Removing someone keeps their recipes and plans, but they can&apos;t open the app until they&apos;re invited again.</p>
        <ul className="m-0 flex list-none flex-col divide-y-2 divide-line rounded-2xl border-2 border-ink bg-paper p-0">
          {people.map((p) => (
            <li key={p.email} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="break-all font-semibold">
                  {p.email}
                  {p.isYou && <span className="font-normal text-muted"> (you)</span>}
                </div>
                <div className="text-sm text-muted" suppressHydrationWarning>
                  {p.via} · {day(p.at)}
                </div>
              </div>
              {!p.isYou &&
                (confirming === p.email ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => start(async () => {
                        await removeAccess(p.email);
                        setConfirming(null);
                      })}
                      className="min-h-[40px] rounded-full bg-tomato px-4 text-sm font-bold text-white hover:bg-tomato-dark"
                    >
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="min-h-[40px] rounded-full px-3 text-sm font-semibold hover:bg-lemon">
                      Keep
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirming(p.email)} className="min-h-[40px] shrink-0 rounded-full px-3 text-sm font-semibold text-muted hover:bg-lemon hover:text-ink">
                    Remove…
                  </button>
                ))}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
