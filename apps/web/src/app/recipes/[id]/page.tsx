import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RecipePhotoButton } from "@/components/recipe-photo-button";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/household";
import { formatAmount } from "@/lib/ingredient-line";
import { countUpcomingDinners, getRecipe, listIngredientNames, listTags, type RecipeDetail, type RecipeLine } from "@/lib/recipes";
import { RecipeEditable } from "@/components/recipe-editable";
import { RebuiltStepsNotice } from "@/components/rebuilt-steps-notice";
import { checkSourcePage } from "@/lib/source-page";
import { sampleRecipes } from "@/lib/sample-recipes";
import { KID_FRIENDLY_TAG } from "@/lib/recipe-edit";

export const metadata: Metadata = { title: "Recipe · Common Thyme" };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "1 1/2 tbsp capers" in ink, then the prep ("rinsed") lighter, the same way on every recipe. */
function IngredientText({ line }: { line: RecipeLine }) {
  if (!line.name) return <span>{line.raw}</span>;
  const amount = [
    line.quantity !== null ? formatAmount(line.quantity) : null,
    line.unit && line.unit !== "each" && line.unit !== "to taste" ? line.unit : null,
  ]
    .filter(Boolean)
    .join(" ");
  const prep = [line.prep, line.unit === "to taste" ? "to taste" : null].filter(Boolean).join(", ");
  return (
    <span>
      {amount && <span className="font-semibold">{amount} </span>}
      <span>{line.name}</span>
      {prep && <span className="text-sm italic text-muted">, {prep}</span>}
    </span>
  );
}

function editable(r: RecipeDetail) {
  return {
    id: r.id,
    title: r.title,
    sourceUrl: r.sourceUrl,
    totalMinutes: r.totalMinutes,
    servings: r.servings,
    tags: r.tags,
    notes: r.notes,
    stepsReconstructed: r.stepsReconstructed,
    updatedAt: r.updatedAt,
    ingredients: r.ingredients.map((i) => ({ quantity: i.quantity, unit: i.unit, name: i.name, prep: i.prep, ingredientId: i.ingredientId })),
    steps: r.steps,
  };
}

/**
 * Chef's "rebuilt these steps" sticker. It only shows while the original page
 * really is gone: if the source link loads again, the sticker stays away.
 */
async function RebuiltNotice({ recipeId, sourceUrl }: { recipeId: string; sourceUrl: string | null }) {
  if (sourceUrl && (await checkSourcePage(sourceUrl)) === "loads") return null;
  return <RebuiltStepsNotice recipeId={recipeId} />;
}

async function Recipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect(`/login?next=/recipes/${id}`);
  const recipe = viewer.kind === "sample" ? sampleRecipes.find((r) => r.id === id) : await getRecipe(id);
  if (!recipe) notFound();
  const household = viewer.kind === "signed-in" ? viewer.household : null;
  const [knownIngredients, knownTags, upcomingDinners] = household
    ? await Promise.all([listIngredientNames(household.id), listTags(household.id), countUpcomingDinners(recipe.id)])
    : [[], [...new Set([...sampleRecipes.flatMap((r) => r.tags.map((t) => t.toLowerCase())), KID_FRIENDLY_TAG])].sort(), 0];

  return (
    <article className="flex flex-wrap items-start gap-8">
      <div className="min-w-[260px] flex-[1_1_380px]">
        <div className="relative aspect-square overflow-hidden rounded-[22px] border-2 border-ink bg-sand">
          {recipe.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket
            <img src={recipe.photoUrl} alt={`Photo of ${recipe.title}`} className="absolute inset-0 h-full w-full object-cover" />
          )}
          {viewer.kind === "signed-in" && <RecipePhotoButton recipeId={recipe.id} hasPhoto={!!recipe.photoUrl} />}
        </div>
      </div>
      <div className="min-w-0 flex-[2_1_480px]">
        <RecipeEditable
          recipe={editable(recipe)}
          knownIngredients={[...new Set(knownIngredients.map((i) => (typeof i === "string" ? i : i.name).toLowerCase()))]}
          knownTags={knownTags}
          upcomingDinners={upcomingDinners}
          deleted={!!recipe.archivedAt}
        >
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
          <Suspense fallback={null}>
            <RebuiltNotice recipeId={recipe.id} sourceUrl={recipe.sourceUrl} />
          </Suspense>
        )}

        <h2 className="mb-3 mt-8 font-display text-2xl font-extrabold">Ingredients</h2>
        {recipe.ingredients.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {recipe.ingredients.map((i, n) => (
              <li key={n} className="flex items-start gap-2 leading-relaxed">
                <span aria-hidden="true" className={`mt-2 h-2.5 w-2.5 flex-none rounded-full border-[1.5px] border-ink ${i.perishable ? "bg-kale" : "bg-paper"}`} />
                <IngredientText line={i} />
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
        {recipe.notes && <p className="mt-6 whitespace-pre-line rounded-xl bg-sand px-4 py-3 text-sm">{recipe.notes}</p>}
        </RecipeEditable>
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
