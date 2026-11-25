export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number };

// Dollars per million tokens for Chef's default model (Claude Opus 5.5).
// Cache writes are 1.25x input. Only an estimate: the Anthropic Console has the bill.
const PRICE = { input: 4, cacheRead: 0.2, cacheWrite: 5, output: 20 };

export function chefCost(usage: Partial<Usage> | null | undefined): number {
  if (!usage) return 0;
  const n = (k: keyof Usage) => Number(usage[k]) || 0;
  return (n("input") * PRICE.input + n("cacheRead") * PRICE.cacheRead + n("cacheWrite") * PRICE.cacheWrite + n("output") * PRICE.output) / 1_000_000;
}

export function dollars(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
