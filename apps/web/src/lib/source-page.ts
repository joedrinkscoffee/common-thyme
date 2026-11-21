import { cacheLife } from "next/cache";

export type SourcePageStatus = "loads" | "gone" | "unknown";

function samePage(a: URL, b: URL): boolean {
  const path = (u: URL) => u.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") && path(a) === path(b);
}

/**
 * Reads one response for a recipe's source link. A page that answers 200 at
 * the same address still loads. A 404 or 410, or a redirect to some other
 * page (Blue Apron sends retired recipes to its home page), means it's gone.
 * Anything else, such as a site blocking us or being down, is unknown.
 */
export function classifySourceResponse(requested: string, status: number, finalUrl: string): SourcePageStatus {
  let from: URL;
  let to: URL;
  try {
    from = new URL(requested);
    to = new URL(finalUrl || requested);
  } catch {
    return "gone";
  }
  if (status === 404 || status === 410) return "gone";
  if (status >= 200 && status < 300) return samePage(from, to) ? "loads" : "gone";
  return "unknown";
}

/**
 * Checks whether a recipe's original page still loads. Cached for days, so a
 * recipe page asks the source site at most a few times a week.
 */
export async function checkSourcePage(url: string): Promise<SourcePageStatus> {
  "use cache";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; CommonThyme/1.0; +https://commonthyme.app)" },
    });
    await res.body?.cancel();
    const status = classifySourceResponse(url, res.status, res.url);
    if (status === "unknown") cacheLife("hours");
    else cacheLife("days");
    return status;
  } catch {
    // A timeout or a dead domain. Try again sooner in case it was a blip.
    cacheLife("hours");
    return "unknown";
  }
}
