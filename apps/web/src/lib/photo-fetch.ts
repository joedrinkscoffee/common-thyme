import "server-only";
import { photoExtension } from "@/lib/recipe-import";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Only fetch from ordinary public web hosts, never the server's own network. */
export function fetchableUrl(raw: string, protocols: string[] = ["https:"]): URL | null {
  try {
    const u = new URL(raw);
    if (!protocols.includes(u.protocol)) return null;
    const host = u.hostname;
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Downloads a recipe photo from the web, or null if it isn't a usable image. */
export async function downloadPhoto(raw: string): Promise<{ bytes: ArrayBuffer; type: string; ext: string } | null> {
  const u = fetchableUrl(raw);
  if (!u) return null;
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(15_000), headers: { accept: "image/*" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type");
    const ext = photoExtension(type);
    if (!ext) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return null;
    return { bytes, type: type!.split(";")[0], ext };
  } catch {
    return null;
  }
}
