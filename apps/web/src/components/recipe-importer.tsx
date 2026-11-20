"use client";

import Link from "next/link";
import { useState } from "react";
import { importRecipe, type ImportOneResult } from "@/app/recipes/import/actions";
import { parseImportFile, type ParsedImport } from "@/lib/recipe-import";

type Phase = "pick" | "ready" | "running" | "done";

/**
 * Pick the import file, check it, then save recipes one at a time with a
 * progress bar. One failed recipe never stops the rest.
 */
export function RecipeImporter() {
  const [phase, setPhase] = useState<Phase>("pick");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [results, setResults] = useState<ImportOneResult[]>([]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const result = parseImportFile(await file.text());
    setParsed(result);
    setResults([]);
    setPhase(result.recipes.length ? "ready" : "pick");
  }

  async function run() {
    if (!parsed) return;
    setPhase("running");
    const done: ImportOneResult[] = [];
    for (const recipe of parsed.recipes) {
      let result: ImportOneResult;
      try {
        result = await importRecipe(recipe);
      } catch {
        result = { ok: false, title: recipe.title, error: "The connection dropped." };
      }
      done.push(result);
      setResults([...done]);
    }
    setPhase("done");
  }

  const total = parsed?.recipes.length ?? 0;
  const saved = results.filter((r) => r.ok).length;
  const failed = results.filter((r): r is Extract<ImportOneResult, { ok: false }> => !r.ok);
  const noPhoto = results.filter((r) => r.ok && r.photo === "failed");
  const pct = total ? Math.round((results.length / total) * 100) : 0;

  return (
    <div className="rounded-[22px] border-2 border-ink bg-paper p-5 sm:p-6">
      {(phase === "pick" || phase === "ready") && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-dash px-4 py-8 text-center transition-colors hover:bg-lemon">
          <span className="font-display text-lg font-extrabold">{fileName || "Choose the import file"}</span>
          <span className="text-sm text-muted">{fileName ? "Choose a different file" : "The .json file Chef put together"}</span>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}

      {parsed && parsed.problems.length > 0 && phase !== "running" && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            {parsed.problems.length} {parsed.problems.length === 1 ? "line" : "lines"} in the file will be skipped
          </summary>
          <ul className="mt-2 text-muted">
            {parsed.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}

      {phase === "ready" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0">
            <strong>{total} recipes</strong> ready to import. Running it again later updates them instead of adding copies.
          </p>
          <button type="button" onClick={run} className="min-h-11 rounded-full bg-tomato px-5 font-bold text-white">
            Import {total} recipes
          </button>
        </div>
      )}

      {(phase === "running" || phase === "done") && (
        <div aria-live="polite">
          <div className="flex items-baseline justify-between">
            <p className="m-0 font-display text-lg font-extrabold">
              {phase === "running" ? `Importing ${results.length + 1} of ${total}…` : `Imported ${saved} of ${total} recipes`}
            </p>
            <span className="text-sm text-muted">{pct}%</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full border-2 border-ink bg-cream" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-kale transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {phase === "running" && results.at(-1) && <p className="mb-0 mt-2 text-sm text-muted">Saved {results.at(-1)!.title}</p>}
        </div>
      )}

      {phase === "done" && (
        <div className="mt-5 flex flex-col gap-3">
          {failed.length > 0 && (
            <div>
              <p className="m-0 font-semibold">{failed.length} didn&apos;t save:</p>
              <ul className="mt-1 text-sm text-muted">
                {failed.map((f) => (
                  <li key={f.title}>
                    {f.title}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {noPhoto.length > 0 && (
            <p className="m-0 text-sm text-muted">
              {noPhoto.length} photos couldn&apos;t be copied ({noPhoto.map((r) => r.title).join(", ")}). Running the import again retries them.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/recipes" className="inline-flex min-h-11 items-center rounded-full bg-tomato px-5 font-bold text-white no-underline">
              See your recipes
            </Link>
            <button type="button" onClick={run} className="min-h-11 rounded-full border-2 border-ink bg-paper px-5 font-bold transition-colors hover:bg-lemon">
              Run it again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
