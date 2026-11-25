import "server-only";
import { headers } from "next/headers";

type HeaderSource = { get(name: string): string | null };

/** The host the browser asked for (Vercel puts it in x-forwarded-host). */
export function requestHost(h: HeaderSource): string | null {
  return h.get("x-forwarded-host") ?? h.get("host");
}

/** "https://commonthyme.app" for the current request, for links people copy. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${requestHost(h)}`;
}

/** False when another site's page sent this request; only our own pages may call the API. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = requestHost(request.headers);
  return !(origin && host && new URL(origin).host !== host);
}
