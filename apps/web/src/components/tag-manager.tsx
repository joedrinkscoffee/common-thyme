"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { mergeTags } from "@/app/recipes/tags/actions";
import { deleteTags, setTagRecipes } from "@/app/settings/actions";
import { tagKey, type TagCount } from "@/lib/tags";

export type TagRecipe = { id: string; title: string; photoUrl: string | null; tags: string[] };

type Note = { ok: boolean; text: string } | null;

const plural = (n: number) => `${n} ${n === 1 ? "recipe" : "recipes"}`;

/**
 * Every tag with its recipe count. "New tag" names one and picks its recipes.
 * Tick one tag to rename it, choose its recipes or delete it; tick several to
 * merge or delete them. A bar at the bottom holds the actions.
 */
export function TagManager({ tags, recipes, sample = false }: { tags: TagCount[]; recipes: TagRecipe[]; sample?: boolean }) {
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [typed, setTyped] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editor, setEditor] = useState<{ tag: string; isNew: boolean } | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [pending, startTransition] = useTransition();

  function clear() {
    setPicked([]);
    setName("");
    setTyped(false);
    setConfirmDelete(false);
  }

  function toggle(tag: string) {
    const next = picked.includes(tag) ? picked.filter((t) => t !== tag) : [...picked, tag];
    setPicked(next);
    setNote(null);
    setConfirmDelete(false);
    // Suggest the most used tag picked, until someone types their own name.
    if (!typed || !next.length) {
      setName(tags.find((t) => next.includes(t.tag))?.tag ?? "");
      if (!next.length) setTyped(false);
    }
  }

  function rename() {
    const from = picked;
    startTransition(async () => {
      const result = await mergeTags(from, name);
      if (!result.ok) return setNote({ ok: false, text: result.error });
      clear();
      setNote({
        ok: true,
        text: from.length > 1 ? `Merged into “${result.to}” on ${plural(result.updated)}.` : `Renamed to “${result.to}” on ${plural(result.updated)}.`,
      });
    });
  }

  function remove() {
    const from = picked;
    startTransition(async () => {
      const result = await deleteTags(from);
      if (!result.ok) return setNote({ ok: false, text: result.error });
      clear();
      setNote({ ok: true, text: `${from.length > 1 ? `${from.length} tags` : `“${from[0]}”`} ${result.message?.toLowerCase() ?? "deleted."}` });
    });
  }

  const total = tags.filter((t) => picked.includes(t.tag)).reduce((n, t) => n + t.count, 0);
  const single = picked.length === 1;
  const nameChanged = single ? name.trim() !== picked[0] : true;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-prose text-[15px] text-muted">Tick a tag to rename it, change which recipes have it, or delete it. Tick several to merge them.</p>
        <button
          type="button"
          onClick={() => {
            clear();
            setNote(null);
            setEditor({ tag: "", isNew: true });
          }}
          className="min-h-11 rounded-full border-2 border-ink bg-lemon px-5 font-bold shadow-pop-sm transition-[background-color,translate,box-shadow] hover:bg-caper active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        >
          + New tag
        </button>
      </div>

      {note && (
        <p
          role="status"
          className={`mb-4 rounded-2xl border-2 px-4 py-3 font-semibold ${note.ok ? "border-ink bg-lemon text-ink" : "border-tomato bg-tomato/5 text-tomato-dark"}`}
        >
          {note.text}
        </p>
      )}

      {tags.length === 0 ? (
        <p className="text-muted">No tags yet. Make one with New tag, or add them on a recipe page.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {tags.map((t) => {
            const on = picked.includes(t.tag);
            return (
              <li key={t.tag}>
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-ink px-4 py-2 transition-colors ${
                    on ? "bg-ink text-cream" : "bg-paper hover:bg-lemon"
                  }`}
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(t.tag)} className="h-5 w-5 flex-none accent-tomato" />
                  <span className="flex-1 font-semibold">{t.tag}</span>
                  <span className={`text-sm ${on ? "text-cream/80" : "text-muted"}`}>{plural(t.count)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {picked.length > 0 && !editor && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-cream px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_0_var(--color-ink)] sm:px-6">
          {confirmDelete ? (
            <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-2">
              <p className="m-0 min-w-0 flex-1 basis-full font-semibold sm:basis-0">
                Take {single ? `“${picked[0]}”` : `${picked.length} tags`} off {plural(total)}? The recipes stay.
              </p>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || sample}
                  onClick={remove}
                  className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:bg-tomato-dark disabled:opacity-50"
                >
                  {pending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="mx-auto flex max-w-[720px] flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (nameChanged) rename();
              }}
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-56">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor={`${id}-name`} className="block text-xs font-extrabold uppercase tracking-wide text-muted">
                    {single ? `Rename “${picked[0]}”` : `Merge ${picked.length} tags into`} · {plural(total)}
                  </label>
                  <button type="button" onClick={clear} className="rounded-full px-2 text-sm font-semibold text-muted hover:bg-lemon hover:text-ink">
                    Cancel
                  </button>
                </div>
                <input
                  id={`${id}-name`}
                  value={name}
                  maxLength={40}
                  onChange={(e) => {
                    setName(e.target.value);
                    setTyped(true);
                  }}
                  className="min-h-11 w-full rounded-xl border-2 border-ink bg-paper px-3 text-ink focus:shadow-pop-sm focus:outline-none"
                />
              </div>
              <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-11 rounded-full border-2 border-tomato bg-paper px-4 font-bold text-tomato-dark transition-colors hover:bg-tomato hover:text-white"
                >
                  Delete
                </button>
                {single && (
                  <button
                    type="button"
                    onClick={() => setEditor({ tag: picked[0], isNew: false })}
                    className="min-h-11 rounded-full border-2 border-ink bg-paper px-4 font-bold transition-colors hover:bg-lemon"
                  >
                    Recipes…
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pending || !name.trim() || !nameChanged || sample}
                  className="ml-auto min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 sm:ml-0"
                >
                  {pending ? "Saving…" : single ? "Rename" : "Merge"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {editor && (
        <TagRecipesSheet
          tag={editor.tag}
          isNew={editor.isNew}
          recipes={recipes}
          sample={sample}
          onClose={(text) => {
            setEditor(null);
            if (text) {
              clear();
              setNote({ ok: true, text });
            }
          }}
        />
      )}
    </>
  );
}

/** Pick which recipes carry a tag. Full screen on a phone, a centered card on wider screens. */
function TagRecipesSheet({ tag, isNew, recipes, sample, onClose }: { tag: string; isNew: boolean; recipes: TagRecipe[]; sample: boolean; onClose: (done?: string) => void }) {
  const id = useId();
  const key = tagKey(tag);
  const [name, setName] = useState(tag);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(isNew ? [] : recipes.filter((r) => r.tags.some((t) => tagKey(t) === key)).map((r) => r.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
    // Ones that have the tag first, so you see what's on it.
    return [...list].sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || a.title.localeCompare(b.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, recipes]);

  function flip(rid: string) {
    const next = new Set(chosen);
    if (next.has(rid)) next.delete(rid);
    else next.add(rid);
    setChosen(next);
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await setTagRecipes(name, [...chosen]);
      if (!r.ok) return setError(r.error);
      onClose(r.message);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/30 sm:items-center sm:p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="flex h-full w-full flex-col bg-cream sm:h-auto sm:max-h-[85vh] sm:max-w-[560px] sm:rounded-[24px] sm:border-2 sm:border-ink sm:shadow-pop-lg"
      >
        <div className="border-b-2 border-ink px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={`${id}-title`} className="m-0 font-display text-2xl font-extrabold">
              {isNew ? "New tag" : `Recipes tagged “${tag}”`}
            </h2>
            <button type="button" onClick={() => onClose()} className="min-h-11 rounded-full px-3 font-semibold text-muted hover:bg-lemon hover:text-ink">
              Close
            </button>
          </div>
          {isNew && (
            <>
              <label htmlFor={`${id}-name`} className="mb-1 mt-3 block text-xs font-extrabold uppercase tracking-wide text-muted">
                Tag name
              </label>
              <input
                ref={firstRef}
                id={`${id}-name`}
                value={name}
                maxLength={40}
                placeholder="e.g. Sheet pan"
                onChange={(e) => setName(e.target.value)}
                className="min-h-11 w-full rounded-xl border-2 border-ink bg-paper px-3 text-ink placeholder:text-muted focus:shadow-pop-sm focus:outline-none"
              />
            </>
          )}
          <label htmlFor={`${id}-q`} className="sr-only">
            Find a recipe
          </label>
          <input
            ref={isNew ? undefined : firstRef}
            id={`${id}-q`}
            type="search"
            value={query}
            placeholder="Find a recipe"
            onChange={(e) => setQuery(e.target.value)}
            className="mt-3 min-h-11 w-full rounded-full border-2 border-dash bg-paper px-4 text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
        </div>

        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-3 sm:px-5">
          {shown.map((r) => {
            const on = chosen.has(r.id);
            return (
              <li key={r.id}>
                <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-1.5 transition-colors ${on ? "border-ink bg-paper" : "border-transparent hover:bg-lemon"}`}>
                  <input type="checkbox" checked={on} onChange={() => flip(r.id)} className="h-5 w-5 flex-none accent-tomato" />
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photoUrl} alt="" className="h-10 w-10 flex-none rounded-lg border-[1.5px] border-ink object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-10 w-10 flex-none rounded-lg border-[1.5px] border-ink bg-sand" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.title}</span>
                </label>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-2 py-4 text-muted">No recipes match.</li>}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t-2 border-ink px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
          <p className="m-0 flex-1 text-sm font-semibold text-muted">{plural(chosen.size)} picked</p>
          {error && (
            <p role="alert" className="m-0 basis-full text-sm font-semibold text-tomato-dark">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !name.trim() || chosen.size === 0 || sample}
            className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {pending ? "Saving…" : isNew ? "Make tag" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
