import "server-only";
import { PHOTO_TYPES } from "@/lib/recipe-photo";

/** Photos sent to the API as base64: up to 3 MB, JPEG, PNG or WebP. */
export const MAX_SENT_PHOTO_BYTES = 3 * 1024 * 1024;

export type SentPhoto = { bytes: Uint8Array; contentType: (typeof PHOTO_TYPES)[number] };

/**
 * Reads `{ data, type }` from a request body. Null when there's no photo;
 * an error message when there is one but it can't be used.
 */
export function readSentPhoto(image: unknown): SentPhoto | { error: string } | null {
  if (!image || typeof image !== "object") return null;
  const { data, type } = image as { data?: unknown; type?: unknown };
  if (typeof data !== "string" || typeof type !== "string") return null;
  if (!(PHOTO_TYPES as readonly string[]).includes(type)) return { error: "Use a JPEG, PNG or WebP photo." };
  const bytes = Uint8Array.from(Buffer.from(data, "base64"));
  if (!bytes.length || bytes.length > MAX_SENT_PHOTO_BYTES) return { error: "That photo is too big." };
  return { bytes, contentType: type as SentPhoto["contentType"] };
}
