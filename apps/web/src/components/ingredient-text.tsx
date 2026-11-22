import { formatAmount } from "@/lib/ingredient-line";
import type { RecipeLine } from "@/lib/recipes";

/** "1 1/2 tbsp capers" in ink, then the prep ("rinsed") lighter, the same way on every recipe. */
export function IngredientText({ line }: { line: RecipeLine }) {
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
