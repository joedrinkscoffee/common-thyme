import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { TagManager } from "@/components/tag-manager";
import { getViewer } from "@/lib/household";
import { listTagCounts } from "@/lib/recipes";
import { sampleRecipes } from "@/lib/sample-recipes";
import { countTags } from "@/lib/tags";

export const metadata: Metadata = { title: "Tags · Common Thyme" };

async function Tags() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/recipes/tags");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "signed-in" && !viewer.household) redirect("/");
  const tags =
    viewer.kind === "sample"
      ? countTags([...sampleRecipes.map((r) => r.tags), ["Sandwiches"], ["sandwiches"], ["asian"]])
      : await listTagCounts(viewer.household!.id);
  if (tags.length === 0) return <p className="text-muted">No tags yet. Add them on a recipe page.</p>;
  return <TagManager tags={tags} />;
}

export default function TagsPage() {
  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-32 sm:px-6">
        <Link href="/recipes" className="mt-4 inline-block text-sm font-semibold text-muted no-underline hover:text-ink">
          ← Recipes
        </Link>
        <h1 className="mb-1 mt-2 font-display text-4xl font-extrabold leading-none tracking-tight">Tags</h1>
        <p className="mb-5 mt-2 text-muted">Pick one tag to rename it, or several to merge them into one. Every recipe with them changes.</p>
        <Suspense fallback={<p className="text-muted">Getting your tags…</p>}>
          <Tags />
        </Suspense>
      </main>
    </>
  );
}
