import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RecipeImporter } from "@/components/recipe-importer";
import { SiteHeader } from "@/components/site-header";
import { TidyIngredients } from "@/components/tidy-ingredients";
import { getViewer } from "@/lib/household";
import { countUntidyLines } from "@/lib/recipe-save";

export const metadata: Metadata = { title: "Import recipes · Common Thyme" };

async function Gate() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/recipes/import");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "signed-in" && !viewer.household) redirect("/");
  const untidy = viewer.kind === "signed-in" && viewer.household ? await countUntidyLines(viewer.household.id) : 0;
  return (
    <>
      {untidy > 0 && <TidyIngredients count={untidy} />}
      <RecipeImporter />
    </>
  );
}

export default function ImportPage() {
  return (
    <>
      <SiteHeader active="recipes" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 sm:px-6">
        <h1 className="mb-2 mt-4 font-display text-4xl font-extrabold leading-none tracking-tight">Import recipes</h1>
        <p className="mb-6 mt-0 leading-relaxed text-muted">
          Bring in your recipes from Airtable and ReciMe in one go. Photos are copied into Common Thyme, so they stay
          even if the original site goes away.
        </p>
        <Suspense fallback={<div className="h-40 rounded-[22px] border-2 border-ink bg-paper" />}>
          <Gate />
        </Suspense>
      </main>
    </>
  );
}
