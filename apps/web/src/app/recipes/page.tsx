import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RecipeLibrary } from "@/components/recipe-library";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/household";
import { DeletedSticker } from "@/components/deleted-sticker";
import { getDeletedTitle, listRecipes } from "@/lib/recipes";
import { sampleRecipes } from "@/lib/sample-recipes";

export const metadata: Metadata = { title: "Recipes · Common Thyme" };

async function Library({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/recipes");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "signed-in" && !viewer.household) redirect("/");

  const recipes = viewer.kind === "sample" ? sampleRecipes : await listRecipes(viewer.household!.id);
  const { deleted } = await searchParams;
  const deletedId = typeof deleted === "string" ? deleted : null;
  const deletedTitle = deletedId && viewer.kind === "signed-in" ? await getDeletedTitle(deletedId) : null;
  const sticker = deletedId && deletedTitle ? <DeletedSticker key={deletedId} id={deletedId} title={deletedTitle} /> : null;
  if (recipes.length === 0) {
    return (
      <div className="rounded-[22px] border-2 border-dashed border-dash px-6 py-12 text-center">
        <p className="m-0 font-display text-2xl font-extrabold">No recipes yet</p>
        <p className="mb-5 mt-1 text-muted">Bring in everything from Airtable and ReciMe in one go.</p>
        {sticker}
        <Link href="/recipes/import" className="inline-flex min-h-11 items-center rounded-full bg-tomato px-5 font-bold text-white no-underline">
          Import recipes
        </Link>
      </div>
    );
  }
  return (
    <>
      <p className="-mt-1 mb-4 text-muted">{recipes.length} recipes</p>
      <RecipeLibrary recipes={recipes} />
      {sticker}
    </>
  );
}

export default function RecipesPage(props: PageProps<"/recipes">) {
  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 sm:px-6">
        <div className="mb-3 mt-4 flex flex-wrap items-end justify-between gap-3">
          <h1 className="m-0 font-display text-4xl font-extrabold leading-none tracking-tight">Recipes</h1>
          <div className="flex gap-2">
            <Link href="/recipes/tags" className="rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold text-ink no-underline transition-colors hover:bg-lemon">
              Tags
            </Link>
            <Link href="/recipes/import" className="rounded-full border-2 border-ink bg-paper px-4 py-2 text-sm font-bold text-ink no-underline transition-colors hover:bg-lemon">
              Import
            </Link>
          </div>
        </div>
        <Suspense fallback={<p className="text-muted">Getting your recipes…</p>}>
          <Library searchParams={props.searchParams} />
        </Suspense>
      </main>
    </>
  );
}
