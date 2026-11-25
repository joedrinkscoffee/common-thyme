import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/components/settings-shell";
import { TagManager } from "@/components/tag-manager";
import { getViewer } from "@/lib/household";
import { listRecipes, listTagCounts } from "@/lib/recipes";
import { sampleRecipes } from "@/lib/sample-recipes";
import { countTags } from "@/lib/tags";

export const metadata: Metadata = { title: "Tags · Settings · Common Thyme" };

async function Tags() {
  const viewer = await getViewer();
  if (viewer.kind === "signed-out") redirect("/login?next=/settings/tags");
  if (viewer.kind === "no-access") redirect("/invite-only");
  if (viewer.kind === "sample") {
    const recipes = sampleRecipes.map((r) => ({ id: r.id, title: r.title, photoUrl: r.photoUrl, tags: r.tags }));
    return <TagManager tags={countTags(recipes.map((r) => r.tags))} recipes={recipes} sample />;
  }
  if (!viewer.household) redirect("/");
  const [tags, recipes] = await Promise.all([listTagCounts(viewer.household.id), listRecipes(viewer.household.id)]);
  return <TagManager tags={tags} recipes={recipes.map((r) => ({ id: r.id, title: r.title, photoUrl: r.photoUrl, tags: r.tags }))} />;
}

export default function TagsSettingsPage() {
  return (
    <SettingsShell tab="tags">
      <Suspense fallback={<p className="text-muted">Getting your tags…</p>}>
        <Tags />
      </Suspense>
    </SettingsShell>
  );
}
