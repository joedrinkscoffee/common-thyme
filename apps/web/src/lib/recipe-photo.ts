/** Photos people pick from their own device. Kept in sync with the importer's limits. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const KEPT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" };

/**
 * Where a new photo for this recipe goes. A fresh name each time, so browsers never show a stale copy.
 * Any type we keep works here (photos copied from recipe sites can be AVIF or GIF); what people may
 * upload themselves is checked against PHOTO_TYPES before this.
 */
export function photoPathFor(householdId: string, recipeId: string, contentType: string, stamp: number): string | null {
  const ext = photoExtension(contentType);
  return ext ? `${householdId}/${recipeId}-${stamp}.${ext}` : null;
}

/** True when the path is one photoPathFor could have made for this recipe. */
export function isPhotoPathFor(path: string, householdId: string, recipeId: string): boolean {
  const prefix = `${householdId}/${recipeId}`;
  if (!path.startsWith(prefix)) return false;
  return /^(-\d{10,16})?\.(jpg|png|webp|avif|gif)$/.test(path.slice(prefix.length));
}

/** File extension for a photo's content type, or null when it isn't a photo we keep. */
export function photoExtension(contentType: string | null): string | null {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return KEPT_TYPES[type] ?? null;
}
