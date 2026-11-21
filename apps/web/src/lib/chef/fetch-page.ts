import { recipeFromHtml, ogImage, pageText, type PageRecipe } from "./recipe-page";

export type FetchedPage =
  | { ok: true; url: string; recipe: PageRecipe | null; text: string; image: string | null }
  | { ok: false; error: string };

function publicUrl(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname;
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return null;
    if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Loads a recipe page from the web. */
export async function fetchRecipePage(raw: string): Promise<FetchedPage> {
  const url = publicUrl(raw);
  if (!url) return { ok: false, error: "That isn't a public web link." };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CommonThyme/1.0; +https://commonthyme.app)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status === 404 || res.status === 410) return { ok: false, error: "That page is gone (the site says it doesn't exist)." };
    if (!res.ok) return { ok: false, error: `The site answered with an error (${res.status}); it may block automated visits.` };
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) return { ok: false, error: "That link isn't a web page." };
    const html = (await res.text()).slice(0, 3_000_000);
    return { ok: true, url: res.url || url.toString(), recipe: recipeFromHtml(html), text: pageText(html), image: ogImage(html) };
  } catch {
    return { ok: false, error: "Couldn't load that page (it timed out or the site is down)." };
  }
}
