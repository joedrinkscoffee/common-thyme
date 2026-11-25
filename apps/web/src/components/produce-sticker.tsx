import type { ButtonHTMLAttributes } from "react";

/** Sticker colours. The same ingredient always gets the same one, so it's easy to follow across the app. */
const COLORS = ["var(--color-kale)", "var(--color-lemon)", "var(--color-caper)"];

export function stickerColor(name: string): string {
  let h = 0;
  const key = name.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/**
 * The oval label you peel off fruit, marking an ingredient that carries across
 * more than one meal. `note` is the small text after the name ("×2", "also Fri").
 */
export function ProduceSticker({
  name,
  note,
  colorOf = name,
  className = "",
}: {
  name: string;
  note?: string;
  /** The ingredient whose colour to use, when the label isn't its name ("also Fri"). */
  colorOf?: string;
  className?: string;
}) {
  return (
    <span className={`produce-sticker ${className}`} style={{ background: stickerColor(colorOf) }}>
      {name}
      {note && <small>{note}</small>}
    </span>
  );
}

/** A sticker you can press (the week board's "trace this ingredient"). */
export function ProduceStickerButton({
  name,
  note,
  className = "",
  ...props
}: { name: string; note?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={`produce-sticker ${className}`} style={{ background: stickerColor(name) }}>
      {name}
      {note && <small>{note}</small>}
    </button>
  );
}
