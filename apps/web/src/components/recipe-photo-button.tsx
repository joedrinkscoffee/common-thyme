"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/lib/recipe-photo";
import { photoTarget, savePhoto } from "@/app/recipes/[id]/actions";

const LONG_EDGE = 1600;

/** Shrinks big phone photos to a sensible size. Falls back to the original file if the browser can't. */
async function prepare(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * 1024 * 1024 && (PHOTO_TYPES as readonly string[]).includes(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function RecipePhotoButton({ recipeId, hasPhoto }: { recipeId: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return setError("Photos aren't set up yet.");
    setBusy(true);
    try {
      const blob = await prepare(file);
      if (!(PHOTO_TYPES as readonly string[]).includes(blob.type)) return setError("Use a JPEG, PNG or WebP photo.");
      if (blob.size > MAX_PHOTO_BYTES) return setError("That photo is over 10 MB.");
      const target = await photoTarget(recipeId, blob.type);
      if (!target.ok) return setError(target.error);
      const { error: uploadError } = await createClient(url, key)
        .storage.from("recipe-photos")
        .upload(target.path, blob, { contentType: blob.type });
      if (uploadError) return setError("Couldn't upload the photo. Try again?");
      const saved = await savePhoto(recipeId, target.path);
      if (!saved.ok) return setError(saved.error ?? "Couldn't save the photo.");
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
      {error && (
        <p role="alert" className="m-0 max-w-[240px] rounded-lg border-2 border-ink bg-paper px-2.5 py-1.5 text-xs font-semibold">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="rounded-full border-2 border-ink bg-paper px-3.5 py-1.5 text-sm font-bold shadow-[2px_2px_0_var(--color-ink)] transition hover:-translate-y-0.5 hover:bg-lemon disabled:cursor-wait disabled:opacity-80"
      >
        {busy ? "Uploading…" : hasPhoto ? "Change photo" : "Add photo"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
