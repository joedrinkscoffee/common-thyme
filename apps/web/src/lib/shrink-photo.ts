/** Browser-only helpers for shrinking a photo before it's sent anywhere. */

/** Draws the photo onto a canvas with its long edge at most `longEdge` pixels. */
export async function drawScaled(file: File, longEdge: number): Promise<{ canvas: HTMLCanvasElement; scaled: boolean }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, scaled: scale < 1 };
}

/** Long edge Claude reads photos at; anything bigger is downscaled on its side anyway. */
const CLAUDE_LONG_EDGE = 1568;

/** A photo for Claude to read: long edge 1568px, JPEG, as base64 plus a preview URL. Null if the browser can't read it. */
export async function photoForClaude(file: File): Promise<{ data: string; type: "image/jpeg"; preview: string } | null> {
  try {
    const { canvas } = await drawScaled(file, CLAUDE_LONG_EDGE);
    const url = canvas.toDataURL("image/jpeg", 0.85);
    return { data: url.split(",")[1], type: "image/jpeg", preview: url };
  } catch {
    return null;
  }
}
