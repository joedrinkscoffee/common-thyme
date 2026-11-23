/**
 * Recipe tags. A tag is matched ignoring case and extra spaces, so "Asian"
 * and "asian" are one tag. Each tag keeps one spelling per household: the
 * one most recipes use, so a capitalized "Asian" from an import stays
 * capitalized after someone edits a recipe.
 */

/** The matching key for a tag: lowercase, single spaces, trimmed. */
export function tagKey(tag: string): string {
  return tag.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Tidies a typed tag: commas become spaces, spaces collapse, case is kept. */
export function cleanTag(tag: string, max = 40): string {
  return tag.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

export type TagCount = { tag: string; count: number };

/**
 * Every tag across these recipes, one per key, with how many recipes use it.
 * The spelling is the one most recipes use; on a tie, the one with capitals.
 * Most used first.
 */
export function countTags(tagLists: string[][]): TagCount[] {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const tags of tagLists) {
    const seen = new Set<string>();
    for (const raw of tags) {
      const tag = raw.replace(/\s+/g, " ").trim();
      const key = tagKey(tag);
      if (!key) continue;
      const entry = byKey.get(key) ?? { count: 0, spellings: new Map() };
      if (!seen.has(key)) entry.count++;
      seen.add(key);
      entry.spellings.set(tag, (entry.spellings.get(tag) ?? 0) + 1);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .map(({ count, spellings }) => ({ tag: pickSpelling(spellings), count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function pickSpelling(spellings: Map<string, number>): string {
  return [...spellings.entries()].sort(
    ([a, an], [b, bn]) => bn - an || Number(b !== b.toLowerCase()) - Number(a !== a.toLowerCase()) || a.localeCompare(b),
  )[0][0];
}

/**
 * Puts a recipe's tags in the household's spelling and drops repeats, so
 * saving "asian" on a household that says "Asian" keeps "Asian".
 */
export function canonicalTags(tags: string[], known: string[]): string[] {
  const spelling = new Map(known.map((t) => [tagKey(t), t.replace(/\s+/g, " ").trim()]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const key = tagKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(spelling.get(key) ?? raw.replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * A recipe's tags after renaming or merging: any tag matching one of `from`
 * becomes `to`, in the first matched place, with no repeats. Returns null
 * when nothing changes.
 */
export function renameTags(tags: string[], from: string[], to: string): string[] | null {
  const fromKeys = new Set(from.map(tagKey));
  const toKey = tagKey(to);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const key = tagKey(raw);
    const next = fromKeys.has(key) || key === toKey ? to : raw;
    const nextKey = tagKey(next);
    if (!nextKey || seen.has(nextKey)) continue;
    seen.add(nextKey);
    out.push(next);
  }
  return out.length === tags.length && out.every((t, i) => t === tags[i]) ? null : out;
}
