"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RecipeEditor, type EditableRecipe } from "@/components/recipe-editor";

/**
 * Shows the recipe as it reads, with one Edit recipe button that swaps the
 * whole column for the editor. The photo stays outside and saves on its own.
 */
export function RecipeEditable({
  recipe,
  knownIngredients,
  knownTags,
  children,
}: {
  recipe: EditableRecipe;
  knownIngredients: string[];
  knownTags: string[];
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  if (editing) {
    return (
      <RecipeEditor
        recipe={recipe}
        knownIngredients={knownIngredients}
        knownTags={knownTags}
        onDone={(didSave) => {
          setEditing(false);
          setSaved(didSave);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    );
  }

  return (
    <div className="relative">
      <div className="float-right mb-2 ml-3 flex items-center gap-2">
        {saved && (
          <span role="status" className="rotate-2 rounded-full border-2 border-ink bg-caper px-3 py-1 text-sm font-extrabold">
            Saved ✓
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setEditing(true);
          }}
          className="rounded-full border-2 border-ink bg-paper px-4 py-1.5 text-sm font-bold shadow-pop-sm transition hover:-translate-y-0.5 hover:bg-lemon"
        >
          Edit recipe
        </button>
      </div>
      {children}
    </div>
  );
}
