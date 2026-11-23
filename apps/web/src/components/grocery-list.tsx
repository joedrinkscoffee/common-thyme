"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addGroceryItem, checkGroceryItem, removeGroceryItem } from "@/app/groceries/actions";
import { AISLE_ICON, AISLE_LABEL, defaultAisle } from "@/lib/grocery/aisles";
import { extraKey, type GroceryItem, type GroceryList } from "@/lib/grocery/list";

type Tab = { weekStart: string; label: string; active: boolean; empty: boolean };

/** How often the list picks up the other person's check marks while it's open. */
const SYNC_MS = 15_000;

/** The recipes an item is for, once each. */
function recipesFor(item: GroceryItem): string[] {
  return [...new Set(item.uses.map((u) => u.title))];
}

function Row({
  item,
  checked,
  onToggle,
  onRemove,
  firstName,
}: {
  item: GroceryItem;
  checked: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  firstName: string | null;
}) {
  const by = checked && item.checkedBy && item.checkedBy !== firstName ? item.checkedBy : null;
  return (
    <li className="flex items-stretch">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="group flex min-h-[60px] min-w-0 flex-1 items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-lemon active:bg-lemon"
      >
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 border-ink text-[15px] font-extrabold transition-colors ${checked ? "bg-caper" : "bg-paper group-hover:bg-cream"}`}
        >
          {checked ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`flex flex-wrap items-baseline gap-x-2 text-[17px] leading-snug ${checked ? "text-muted line-through decoration-2" : ""}`}>
            <span className="font-semibold">{item.name}</span>
            {item.amount && <span className={`text-[15px] font-bold ${checked ? "" : "text-ink-soft"}`}>{item.amount}</span>}
          </span>
          {item.extra ? (
            <span className="mt-0.5 block text-[13px] text-muted">Added by hand</span>
          ) : (
            <span className="mt-1 flex flex-wrap gap-1" aria-label="For">
              {recipesFor(item).map((t) => (
                <span key={t} className={`max-w-full truncate rounded-full bg-sand px-2 py-0.5 text-[12px] font-semibold ${checked ? "text-muted" : "text-ink-soft"}`}>
                  {t}
                </span>
              ))}
            </span>
          )}
        </span>
        {by && (
          <span className="flex-none rotate-2 rounded-full border-[1.5px] border-ink bg-kale px-2 py-0.5 text-[11px] font-extrabold">{by} got it</span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          title="Remove"
          className="ml-1 flex w-11 flex-none items-center justify-center rounded-2xl text-xl text-muted transition-colors hover:bg-lemon hover:text-ink"
        >
          ×
        </button>
      )}
    </li>
  );
}

/**
 * The week's grocery list, for a phone in the store: aisles in the order you
 * walk them, big rows to tap off, check marks shared with the household.
 * Taps save straight away and retry if the signal drops.
 */
export function GroceryListView({
  weekStart,
  range,
  tabs,
  list,
  ready,
  firstName,
  sample,
}: {
  weekStart: string;
  range: string;
  tabs: Tab[];
  list: GroceryList;
  ready: boolean;
  firstName: string | null;
  sample: boolean;
}) {
  const router = useRouter();
  // Taps not confirmed by the server yet: key -> checked.
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [added, setAdded] = useState<GroceryItem[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  const queue = useRef<Map<string, boolean>>(new Map());
  const flushing = useRef(false);

  // Fresh server data replaces what it confirms.
  const [seen, setSeen] = useState(list);
  if (seen !== list) {
    setSeen(list);
    const all = [...list.sections.flatMap((s) => s.items), ...list.staples];
    const server = new Map(all.map((i) => [i.key, i.checked]));
    setPending((p) => new Map([...p].filter(([k, v]) => server.get(k) !== v)));
    setAdded((a) => a.filter((x) => !server.has(x.key)));
    setRemoved((r) => new Set([...r].filter((k) => server.has(k))));
  }

  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  const flush = useCallback(async () => {
    if (flushing.current || sample) return;
    flushing.current = true;
    try {
      while (queue.current.size) {
        const [key, checked] = queue.current.entries().next().value!;
        queue.current.delete(key);
        const res = await checkGroceryItem(weekStart, key, checked).catch(() => ({ ok: false as const, error: "offline" }));
        if (!res.ok) {
          // Keep it for the next try, unless a newer tap replaced it.
          if (!queue.current.has(key)) queue.current.set(key, checked);
          setOffline(true);
          return;
        }
      }
      setOffline(false);
      refresh();
    } finally {
      flushing.current = false;
    }
  }, [weekStart, sample, refresh]);

  // Pick up the other person's taps, and retry anything that didn't save.
  useEffect(() => {
    if (sample) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (queue.current.size) void flush();
      else refresh();
    };
    const id = window.setInterval(tick, SYNC_MS);
    const onVisible = () => document.visibilityState === "visible" && tick();
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sample, flush, refresh]);

  const isChecked = (item: GroceryItem) => pending.get(item.key) ?? item.checked;

  function toggle(item: GroceryItem) {
    const next = !isChecked(item);
    setPending((p) => new Map(p).set(item.key, next));
    if (sample || !ready) return;
    queue.current.set(item.key, next);
    void flush();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const label = draft.replace(/\s+/g, " ").trim();
    if (!label) return;
    setDraft("");
    setError(null);
    const item: GroceryItem = { key: extraKey(label), name: label.charAt(0).toUpperCase() + label.slice(1), amount: null, aisle: defaultAisle(label), uses: [], checked: false, checkedBy: null, extra: true };
    setAdded((a) => [...a.filter((x) => x.key !== item.key), item]);
    setRemoved((r) => {
      const n = new Set(r);
      n.delete(item.key);
      return n;
    });
    if (sample || !ready) return;
    const res = await addGroceryItem(weekStart, label).catch(() => ({ ok: false as const, error: "offline" }));
    if (!res.ok) {
      setAdded((a) => a.filter((x) => x.key !== item.key));
      setDraft(label);
      setError("Couldn't add that. Check your connection and try again?");
    } else refresh();
  }

  async function remove(item: GroceryItem) {
    setRemoved((r) => new Set(r).add(item.key));
    if (sample || !ready) return;
    const res = await removeGroceryItem(weekStart, item.key).catch(() => ({ ok: false as const, error: "offline" }));
    if (!res.ok) {
      setRemoved((r) => {
        const n = new Set(r);
        n.delete(item.key);
        return n;
      });
      setError("Couldn't remove that. Try again?");
    } else refresh();
  }

  // The list with taps, additions and removals that haven't come back from the server yet.
  const sections = useMemo(() => {
    const extras = added.filter((a) => !list.sections.some((s) => s.items.some((i) => i.key === a.key)));
    const out = list.sections.map((s) => ({ ...s, items: [...s.items, ...extras.filter((a) => a.aisle === s.aisle)] }));
    for (const a of extras) {
      if (a.aisle === "staples" || out.some((s) => s.aisle === a.aisle)) continue;
      out.push({ aisle: a.aisle, label: AISLE_LABEL[a.aisle], items: [a] });
    }
    return out
      .map((s) => ({ ...s, items: s.items.filter((i) => !removed.has(i.key)) }))
      .filter((s) => s.items.length);
  }, [list.sections, added, removed]);
  const staples = [...list.staples, ...added.filter((a) => a.aisle === "staples")].filter((i) => !removed.has(i.key));

  const all = sections.flatMap((s) => s.items);
  const total = all.length;
  const done = all.filter(isChecked).length;
  const left = total - done;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="m-0 text-[13px] font-bold tracking-[0.08em] text-muted">GROCERIES · {range.toUpperCase()}</p>
          <h1 className="m-0 mt-1 font-display text-4xl font-extrabold tracking-tight">
            {!total ? "Nothing to buy yet" : left ? `${left} thing${left === 1 ? "" : "s"} to get` : "All in the cart"}
          </h1>
        </div>
        <nav aria-label="Which week" className="flex gap-1.5 rounded-full border-2 border-ink bg-paper p-1">
          {tabs.map((t) => (
            <Link
              key={t.weekStart}
              href={`/groceries?week=${t.weekStart}`}
              aria-current={t.active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold no-underline transition-colors ${t.active ? "bg-ink text-cream" : "text-ink hover:bg-lemon"} ${t.empty ? "opacity-60" : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {total > 0 && (
        <div>
          <div className="h-4 overflow-hidden rounded-full border-2 border-ink bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="In the cart">
            <div className="h-full bg-caper transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
          <p className="mb-0 mt-1.5 text-[14px] text-muted">
            {done} of {total} in the cart · for {list.meals} meal{list.meals === 1 ? "" : "s"}
            {offline && <span className="ml-2 rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[12px] font-bold text-ink">Offline · saving when you&apos;re back</span>}
          </p>
        </div>
      )}

      {!ready && (
        <p className="m-0 rounded-2xl border-2 border-tomato bg-paper px-4 py-3 text-[15px]">
          Check marks won&apos;t save until the grocery list update is run in Supabase.
        </p>
      )}

      {!total && !staples.length && (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-dash p-6 text-center">
          <p className="m-0 text-muted">No meals planned for {range} yet.</p>
          <Link href="/" className="rounded-full border-2 border-ink bg-paper px-4 py-2 font-bold text-ink no-underline transition-colors hover:bg-lemon">
            Ask Chef to plan it
          </Link>
        </div>
      )}

      {sections.map((s) => {
        const sorted = [...s.items].sort((a, b) => Number(isChecked(a)) - Number(isChecked(b)));
        const open = s.items.filter((i) => !isChecked(i)).length;
        return (
          <section key={s.aisle} aria-label={s.label} className="rounded-[24px] border-2 border-ink bg-paper px-2 pb-2 pt-3">
            <h2 className="m-0 flex items-center gap-2 px-3 pb-1 font-display text-lg font-extrabold">
              <span aria-hidden="true" className="-rotate-6 text-xl">
                {AISLE_ICON[s.aisle]}
              </span>
              {s.label}
              <span className="ml-auto text-[13px] font-bold text-muted">{open ? `${open} left` : "✓ done"}</span>
            </h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {sorted.map((item) => (
                <Row key={item.key} item={item} checked={isChecked(item)} onToggle={() => toggle(item)} onRemove={item.extra ? () => void remove(item) : undefined} firstName={firstName} />
              ))}
            </ul>
          </section>
        );
      })}

      {staples.length > 0 && (
        <details className="group rounded-[24px] border-2 border-dashed border-dash bg-cream px-2 pb-2 pt-3 open:border-solid open:border-ink open:bg-paper">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-3 pb-1 font-display text-lg font-extrabold transition-colors hover:bg-lemon [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="-rotate-6 text-xl">
              {AISLE_ICON.staples}
            </span>
            <span className="min-w-0">{AISLE_LABEL.staples}</span>
            <span className="ml-auto flex flex-none items-center gap-1.5 text-[13px] font-bold text-muted">
              {staples.length}
              <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </summary>
          <p className="m-0 px-3 pb-1 text-[14px] text-muted">Check the pantry before you go. Tell Chef if you never keep one on hand.</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {staples.map((item) => (
              <Row key={item.key} item={item} checked={isChecked(item)} onToggle={() => toggle(item)} onRemove={item.extra ? () => void remove(item) : undefined} firstName={firstName} />
            ))}
          </ul>
        </details>
      )}

      {(total > 0 || staples.length > 0) && (
        <form onSubmit={add} className="flex items-center gap-2">
          <label htmlFor="grocery-add" className="sr-only">
            Add something else
          </label>
          <input
            id="grocery-add"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={80}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Add something else, like paper towels"
            className="min-h-[52px] min-w-0 flex-1 rounded-[26px] border-2 border-ink bg-paper px-5 text-base"
          />
          <button type="submit" className="min-h-[52px] flex-none rounded-full bg-tomato px-5 font-bold text-white transition-colors hover:bg-tomato-dark">
            Add
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-2xl border-2 border-tomato bg-paper px-4 py-2.5">
          {error}
        </p>
      )}
    </div>
  );
}
