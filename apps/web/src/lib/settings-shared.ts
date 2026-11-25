/** Shared by the Settings forms and their server actions. */

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The common US zones first, then the rest of the world, plus `current` if it isn't listed. */
export function timeZoneOptions(current: string): { value: string; label: string }[] {
  const common = [
    ["America/New_York", "Eastern"],
    ["America/Chicago", "Central"],
    ["America/Denver", "Mountain"],
    ["America/Phoenix", "Arizona"],
    ["America/Los_Angeles", "Pacific"],
    ["America/Anchorage", "Alaska"],
    ["Pacific/Honolulu", "Hawaii"],
  ];
  const all: string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const seen = new Set(common.map(([v]) => v));
  const rest = all.filter((z) => !seen.has(z)).map((z) => ({ value: z, label: z.replace(/_/g, " ") }));
  const out = [...common.map(([value, label]) => ({ value, label: `${label} (${value.replace(/_/g, " ")})` })), ...rest];
  if (current && !out.some((o) => o.value === current)) out.unshift({ value: current, label: current.replace(/_/g, " ") });
  return out;
}
