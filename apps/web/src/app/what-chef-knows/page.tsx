import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/household";
import { chefContext } from "@/lib/chef/server";
import type { ChefNote } from "@/lib/chef/store";
import { forgetNote } from "./actions";

const SAMPLE: ChefNote[] = [
  { id: "1", source: "you_said", category: "tastes", body: "No mushrooms for Joe's partner." },
  { id: "2", source: "you_said", category: "habits", body: "Friday is usually pizza night." },
  { id: "3", source: "learned", category: "habits", body: "Fish dinners get skipped more than others." },
];

function NoteList({ title, hint, notes, sample }: { title: string; hint: string; notes: ChefNote[]; sample: boolean }) {
  return (
    <section className="rounded-[24px] border-2 border-ink bg-paper p-5 sm:p-6">
      <h2 className="m-0 font-display text-xl font-extrabold">{title}</h2>
      <p className="mb-4 mt-1 text-[15px] text-muted">{hint}</p>
      {notes.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {notes.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-2.5">
              <span>
                <span className="mr-2 rounded-full border-[1.5px] border-ink bg-lemon px-2 py-0.5 text-[11px] font-extrabold">{n.category}</span>
                {n.body}
              </span>
              {!sample && (
                <form action={forgetNote.bind(null, n.id)}>
                  <button type="submit" className="rounded-full px-3 py-1 text-sm font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink">
                    Forget
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted">Nothing yet.</p>
      )}
    </section>
  );
}

async function Notes() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login");
  let notes = SAMPLE;
  const sample = viewer.kind === "sample";
  if (viewer.kind === "signed-in") {
    if (!viewer.household) redirect("/");
    const { store } = await chefContext({ userId: viewer.userId, firstName: viewer.firstName, household: viewer.household });
    notes = await store.notes();
  }
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <NoteList title="You said" hint="Things you told Chef. Tell Chef in the chat to add more." notes={notes.filter((n) => n.source === "you_said")} sample={sample} />
      <NoteList title="Chef noticed" hint="Patterns Chef picked up from how your weeks went." notes={notes.filter((n) => n.source === "learned")} sample={sample} />
    </div>
  );
}

export default function WhatChefKnows() {
  return (
    <>
      <SiteHeader active="knows" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 sm:px-6">
        <h1 className="mb-1 mt-2 font-display text-4xl font-extrabold tracking-tight">What Chef knows</h1>
        <p className="mb-6 mt-0 text-muted">Chef uses these when it plans your week. Forget anything that&apos;s no longer true.</p>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Notes />
        </Suspense>
      </main>
    </>
  );
}
