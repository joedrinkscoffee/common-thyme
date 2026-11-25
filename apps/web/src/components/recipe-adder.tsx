"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { byFolder, linksFromBookmarks, linksFromText, MAX_LINKS_PER_RUN, type FoundLink } from "@/lib/link-list";
import type { AddRecipeResponse } from "@/app/api/recipes/add/route";
import { photoForClaude } from "@/lib/shrink-photo";

const MAX_PHOTOS = 30;
const AT_ONCE = 3;

type Photo = { key: string; data: string; type: string; preview: string; name: string };
type State = "waiting" | "working" | AddRecipeResponse;
type Item = { key: string; label: string; url?: string; photo?: Photo; state: State };

async function preparePhoto(file: File): Promise<Photo | null> {
  const got = await photoForClaude(file);
  return got && { key: crypto.randomUUID(), ...got, name: file.name };
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

async function send(item: Item): Promise<AddRecipeResponse> {
  try {
    const res = await fetch("/api/recipes/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item.photo ? { image: { data: item.photo.data, type: item.photo.type } } : { url: item.url }),
    });
    return (await res.json()) as AddRecipeResponse;
  } catch {
    return { status: "failed", error: "The connection dropped." };
  }
}

function FolderGroup({
  folder,
  links,
  picked,
  setPicked,
}: {
  folder: string;
  links: FoundLink[];
  picked: Set<string>;
  setPicked: (next: Set<string>) => void;
}) {
  const box = useRef<HTMLInputElement>(null);
  const count = links.filter((l) => picked.has(l.url)).length;
  useEffect(() => {
    if (box.current) box.current.indeterminate = count > 0 && count < links.length;
  }, [count, links.length]);
  const toggleAll = () => {
    const next = new Set(picked);
    for (const l of links) {
      if (count === links.length) next.delete(l.url);
      else next.add(l.url);
    }
    setPicked(next);
  };
  return (
    <details open={count > 0} className="border-b-2 border-dash last:border-b-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 transition-colors hover:bg-lemon">
        <input
          ref={box}
          type="checkbox"
          checked={count === links.length}
          onChange={toggleAll}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Pick every link in ${folder || "this list"}`}
          className="size-5 shrink-0 accent-tomato"
        />
        <span className="min-w-0 flex-1 truncate font-bold">{folder || "Bookmarks"}</span>
        <span className="shrink-0 text-sm text-muted">
          {count} of {links.length}
        </span>
      </summary>
      <ul className="m-0 list-none p-0 pb-2">
        {links.map((l) => (
          <li key={l.url}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5 pl-6 pr-3 transition-colors hover:bg-lemon">
              <input
                type="checkbox"
                checked={picked.has(l.url)}
                onChange={() => {
                  const next = new Set(picked);
                  if (next.has(l.url)) next.delete(l.url);
                  else next.add(l.url);
                  setPicked(next);
                }}
                className="size-5 shrink-0 accent-tomato"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{l.title}</span>
                <span className="block truncate text-xs text-muted">{host(l.url)}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Row({ item }: { item: Item }) {
  const s = item.state;
  const thumb = item.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.photo.preview} alt="" className="size-11 shrink-0 rounded-lg border-2 border-ink object-cover" />
  ) : (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg border-2 border-ink bg-cream text-lg" aria-hidden>
      🔗
    </span>
  );
  let title = item.label;
  let detail: React.ReactNode = s === "waiting" ? "Waiting" : s === "working" ? "Reading…" : null;
  let tone = "text-muted";
  let href: string | null = null;
  if (typeof s === "object") {
    if (s.status === "saved") {
      title = s.title;
      href = `/recipes/${s.id}`;
      tone = "text-ink-soft";
      detail = s.photo ? "Added" : <span className="rounded-[5px] bg-lemon px-1.5 font-semibold text-ink">Added · needs a photo</span>;
    } else if (s.status === "duplicate") {
      title = s.title;
      href = s.id ? `/recipes/${s.id}` : null;
      detail = "Already in your recipes";
    } else {
      tone = "text-tomato-dark";
      detail = s.error;
    }
  }
  const body = (
    <>
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className={`block text-sm ${tone}`}>{detail}</span>
      </span>
      {s === "working" && <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-ink border-t-transparent" aria-hidden />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-1.5 text-ink no-underline transition-colors hover:bg-lemon">
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-3 px-2 py-1.5">{body}</div>
      )}
    </li>
  );
}

/**
 * Add recipes from links (pasted, or a browser's bookmarks file) and from
 * photos (screenshots, cookbook pages, recipe cards), many at once.
 */
export function RecipeAdder() {
  const [text, setText] = useState("");
  const [bookmarks, setBookmarks] = useState<FoundLink[] | null>(null);
  const [bookmarkFile, setBookmarkFile] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [running, setRunning] = useState(false);

  const pasted = useMemo(() => linksFromText(text), [text]);
  const links = useMemo(() => {
    const seen = new Set<string>();
    const out: FoundLink[] = [];
    for (const l of [...pasted, ...(bookmarks ?? []).filter((b) => picked.has(b.url))]) {
      if (seen.has(l.url)) continue;
      seen.add(l.url);
      out.push(l);
    }
    return out;
  }, [pasted, bookmarks, picked]);
  const total = links.length + photos.length;
  const tooMany = links.length > MAX_LINKS_PER_RUN;

  async function onBookmarks(file: File | undefined) {
    if (!file) return;
    const found = linksFromBookmarks(await file.text());
    if (!found.length) {
      setNote("That file has no bookmarks in it. Export bookmarks as an HTML file and try again.");
      return;
    }
    setNote(null);
    setBookmarkFile(file.name);
    setBookmarks(found);
    setPicked(new Set(found.filter((l) => l.recipe).map((l) => l.url)));
  }

  async function onPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPreparing(true);
    const room = MAX_PHOTOS - photos.length;
    const ready = (await Promise.all([...files].slice(0, room).map(preparePhoto))).filter((p): p is Photo => !!p);
    setPhotos((p) => [...p, ...ready]);
    setNote(files.length > room ? `Up to ${MAX_PHOTOS} photos at a time; add the rest after these.` : ready.length < Math.min(files.length, room) ? "Some of those couldn't be opened as photos." : null);
    setPreparing(false);
  }

  async function run(list: Item[]) {
    setRunning(true);
    const current = [...list];
    setItems([...current]);
    let next = 0;
    const update = (i: number, state: State) => {
      current[i] = { ...current[i], state };
      setItems([...current]);
    };
    async function worker() {
      while (next < current.length) {
        const i = next++;
        if (current[i].state !== "waiting") continue;
        update(i, "working");
        update(i, await send(current[i]));
      }
    }
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    setRunning(false);
  }

  function start() {
    if (!total || tooMany) return;
    run([
      ...photos.map((p, n): Item => ({ key: p.key, label: `Photo ${n + 1}`, photo: p, state: "waiting" })),
      ...links.map((l): Item => ({ key: l.url, label: l.title === l.url ? host(l.url) : l.title, url: l.url, state: "waiting" })),
    ]);
  }

  function reset() {
    setItems(null);
    setText("");
    setBookmarks(null);
    setBookmarkFile("");
    setPicked(new Set());
    setPhotos([]);
    setNote(null);
  }

  if (items) {
    const done = items.filter((i) => typeof i.state === "object");
    const added = done.filter((i) => typeof i.state === "object" && i.state.status === "saved");
    const failed = items.filter((i) => typeof i.state === "object" && i.state.status === "failed");
    const noPhoto = added.filter((i) => typeof i.state === "object" && i.state.status === "saved" && !i.state.photo);
    const pct = Math.round((done.length / items.length) * 100);
    return (
      <div className="rounded-[22px] border-2 border-ink bg-paper p-4 sm:p-6" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="m-0 font-display text-lg font-extrabold">
            {running ? `Adding ${done.length + 1} of ${items.length}…` : `Added ${added.length} of ${items.length}`}
          </p>
          <span className="text-sm text-muted">{pct}%</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full border-2 border-ink bg-cream" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-kale transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {!running && noPhoto.length > 0 && (
          <p className="mb-0 mt-4 rounded-xl bg-lemon px-3 py-2 text-sm">
            {noPhoto.length === 1 ? "One recipe needs" : `${noPhoto.length} recipes need`} a photo of the finished dish. Tap one to add it.
          </p>
        )}
        <ul className="-mx-2 mb-0 mt-4 list-none p-0">
          {items.map((i) => (
            <Row key={i.key} item={i} />
          ))}
        </ul>
        {!running && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/recipes" className="inline-flex min-h-11 items-center rounded-full bg-tomato px-5 font-bold text-white no-underline">
              See your recipes
            </Link>
            {failed.length > 0 && (
              <button
                type="button"
                onClick={() => run(items.map((i) => (failed.includes(i) ? { ...i, state: "waiting" } : i)))}
                className="min-h-11 rounded-full border-2 border-ink bg-paper px-5 font-bold transition-colors hover:bg-lemon"
              >
                Try {failed.length === 1 ? "that one" : `those ${failed.length}`} again
              </button>
            )}
            <button type="button" onClick={reset} className="min-h-11 rounded-full border-2 border-ink bg-paper px-5 font-bold transition-colors hover:bg-lemon">
              Add more
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[22px] border-2 border-ink bg-paper p-4 sm:p-6">
        <h2 className="m-0 font-display text-xl font-extrabold">From links</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-muted">
          Paste one link or a whole list: from your bookmarks, Pinterest pins, notes or texts. Chef reads each page and copies the recipe and its photo.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="https://…"
          aria-label="Recipe links"
          className="block w-full resize-y rounded-2xl border-2 border-ink bg-cream px-4 py-3 text-base leading-6"
        />
        {pasted.length > 0 && (
          <p className="mb-0 mt-2 text-sm font-semibold">
            {pasted.length} {pasted.length === 1 ? "link" : "links"} found
          </p>
        )}

        <div className="mt-4 border-t-2 border-dash pt-4">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-bold transition-colors hover:bg-lemon">
            {bookmarkFile ? "Choose a different bookmarks file" : "Upload a bookmarks file"}
            <input type="file" accept=".html,.htm,text/html" className="sr-only" onChange={(e) => onBookmarks(e.target.files?.[0])} />
          </label>
          {!bookmarks && (
            <details className="mt-2 text-sm text-muted">
              <summary className="cursor-pointer font-semibold text-ink">How to export bookmarks (on a computer)</summary>
              <ul className="mb-0 mt-2 pl-5 leading-relaxed">
                <li>Chrome or Edge: Bookmarks manager, then the ⋮ menu, then Export bookmarks.</li>
                <li>Safari: File, then Export, then Bookmarks.</li>
                <li>Firefox: Bookmarks, then Manage bookmarks, then Import and Backup, then Export to HTML.</li>
              </ul>
            </details>
          )}
          {bookmarks && (
            <>
              <p className="mb-2 mt-3 text-sm text-muted">
                {bookmarks.length} bookmarks in {bookmarkFile}. Links that look like recipes are ticked; change any you like.
              </p>
              <div className="max-h-96 overflow-y-auto rounded-2xl border-2 border-ink">
                {byFolder(bookmarks).map((g) => (
                  <FolderGroup key={g.folder} folder={g.folder} links={g.links} picked={picked} setPicked={setPicked} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="rounded-[22px] border-2 border-ink bg-paper p-4 sm:p-6">
        <h2 className="m-0 font-display text-xl font-extrabold">From photos</h2>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-muted">
          Screenshots from Instagram or TikTok, cookbook pages, recipe cards. One recipe per photo. If a photo doesn&apos;t show the finished dish, you can add one after.
        </p>
        {photos.length > 0 && (
          <ul className="m-0 mb-3 grid list-none grid-cols-4 gap-2 p-0 sm:grid-cols-6">
            {photos.map((p) => (
              <li key={p.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt={p.name} className="aspect-square w-full rounded-xl border-2 border-ink object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((all) => all.filter((x) => x.key !== p.key))}
                  aria-label={`Remove ${p.name}`}
                  className="absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full border-2 border-ink bg-paper text-sm font-bold leading-none transition-colors hover:bg-lemon"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 border-ink bg-paper px-4 text-sm font-bold transition-colors hover:bg-lemon">
          {preparing ? "Opening photos…" : photos.length ? "Add more photos" : "Choose photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              onPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </section>

      {note && <p className="m-0 rounded-xl bg-lemon px-3 py-2 text-sm">{note}</p>}
      {tooMany && (
        <p className="m-0 rounded-xl bg-lemon px-3 py-2 text-sm">
          That&apos;s {links.length} links. Pick up to {MAX_LINKS_PER_RUN} at a time; you can come back for the rest.
        </p>
      )}

      <div className="sticky bottom-3 z-10">
        <button
          type="button"
          onClick={start}
          disabled={!total || tooMany || preparing}
          className="min-h-12 w-full rounded-full border-2 border-ink bg-tomato px-5 font-bold text-white shadow-pop-sm transition hover:-translate-y-0.5 hover:bg-tomato-dark disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-dash disabled:bg-cream disabled:text-muted disabled:shadow-none"
        >
          {total ? `Add ${total} ${total === 1 ? "recipe" : "recipes"}` : "Paste links or choose photos"}
        </button>
      </div>
    </div>
  );
}
