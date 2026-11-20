import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/household";
import { getRecipe } from "@/lib/recipes";
import { sampleRecipes } from "@/lib/sample-recipes";

export const metadata: Metadata = { title: "Recipe · Common Thyme" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function Recipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect(`/login?next=/recipes/${id}`);
  const recipe = viewer.kind === "sample" ? sampleRecipes.find((r) => r.id === id) : await getRecipe(id);
  if (!recipe) notFound();

  return (
    <article className="flex flex-wrap items-start gap-8">
      <div className="min-w-[260px] flex-[1_1_380px]">
        <div className="relative aspect-square overflow-hidden rounded-[22px] border-2 border-ink bg-sand">
          {recipe.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
            <img src={recipe.photoUrl} alt={`Photo of ${recipe.title}`} className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-[2_1_480px]">
        <div className="flex flex-wrap gap-2">
          {recipe.tags.map((t) => (
            <span key={t} className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold text-cream">
              {t}
            </span>
          ))}
        </div>
        <h1 className="mb-2 mt-3 font-display text-4xl font-extrabold leading-none tracking-tight">{recipe.title}</h1>
        <p className="m-0 text-muted">
          Serves {recipe.servings}
          {recipe.totalMinutes ? ` · ${recipe.totalMinutes} min` : ""}
          {recipe.sourceUrl && (
            <>
              {" · "}
              <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="text-ink underline">
                {hostOf(recipe.sourceUrl)}
              </a>
            </>
          )}
        </p>
        {recipe.stepsReconstructed && (
          <p className="mb-0 mt-4 inline-block -rotate-1 rounded-xl border-2 border-ink bg-lemon px-3 py-2 text-sm font-semibold">
            The original page is gone, so Chef rebuilt these steps from what was saved.
          </p>
        )}

        <h2 className="mb-3 mt-8 font-display text-2xl font-extrabold">Ingredients</h2>
        {recipe.ingredients.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {recipe.ingredients.map((i, n) => (
              <li key={n} className="flex items-start gap-2 leading-relaxed">
                <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 flex-none rounded-full border-[1.5px] border-ink ${i.perishable ? "bg-kale" : "bg-paper"}`} />
                <span>{i.raw}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No ingredients saved yet.</p>
        )}

        <h2 className="mb-3 mt-8 font-display text-2xl font-extrabold">Steps</h2>
        {recipe.steps.length ? (
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {recipe.steps.map((s, n) => (
              <li key={n} className="flex gap-3">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-tomato font-bold text-white">{n + 1}</span>
                <div className="leading-relaxed">
                  {s.title && <div className="font-display font-extrabold">{s.title}</div>}
                  <p className="m-0 whitespace-pre-line">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">No steps saved yet.</p>
        )}
        {recipe.notes && <p className="mt-6 rounded-xl bg-sand px-4 py-3 text-sm">{recipe.notes}</p>}
      </div>
    </article>
  );
}

export default function RecipePage(props: PageProps<"/recipes/[id]">) {
  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 sm:px-6">
        <Link href="/recipes" className="mb-4 mt-2 inline-block text-sm font-semibold text-ink">
          ← All recipes
        </Link>
        <Suspense fallback={<p className="text-muted">Getting the recipe…</p>}>
          <Recipe params={props.params} />
        </Suspense>
      </main>
    </>
  );
}
