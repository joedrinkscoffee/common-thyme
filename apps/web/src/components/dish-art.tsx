/*
  Line-drawn dishes in the same style as the app icon. Used by the sign-in demo,
  and in place of a photo when a recipe doesn't have one yet.
*/

const INK = "#1f1a17";

export function PastaArt() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
      <circle cx="50" cy="56" r="36" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
      <circle cx="50" cy="56" r="27" fill="#f6dc8f" stroke={INK} strokeWidth="2" />
      <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d="M30 50c6-6 10 6 16 0s10 6 16 0 8 4 10 2" />
        <path d="M28 60c6-6 10 6 16 0s10 6 16 0 8 4 12 1" />
        <path d="M33 70c6-5 9 5 15 0s9 5 14 0" />
      </g>
      <g fill="#7fb24a" stroke={INK} strokeWidth="1.6">
        <circle cx="40" cy="45" r="4" />
        <circle cx="61" cy="66" r="4.5" />
        <circle cx="52" cy="57" r="3.5" />
      </g>
      <g fill="#e9b47a" stroke={INK} strokeWidth="1.8">
        <rect x="55" y="40" width="12" height="9" rx="3" transform="rotate(14 61 44)" />
        <rect x="33" y="60" width="11" height="8" rx="3" transform="rotate(-12 38 64)" />
      </g>
      <path d="M68 28c6-2 11 2 12 7-6 2-11-1-12-7z" fill="#3f8f5a" stroke={INK} strokeWidth="1.8" />
    </svg>
  );
}

export function BowlArt() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
      <circle cx="50" cy="56" r="36" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
      <path d="M50 56V20a36 36 0 0 1 34 24z" fill="#3f8f5a" stroke={INK} strokeWidth="2" />
      <path d="M50 56l34-12a36 36 0 0 1-22 46z" fill="#efe2c4" stroke={INK} strokeWidth="2" />
      <g fill={INK}>
        <circle cx="66" cy="62" r="1.3" />
        <circle cx="72" cy="56" r="1.3" />
        <circle cx="62" cy="72" r="1.3" />
        <circle cx="70" cy="70" r="1.3" />
      </g>
      <g stroke={INK} strokeWidth="1.8">
        <path d="M24 60a9 7 0 0 1 18 0z" fill="#b07a4f" />
        <path d="M32 60h2v6h-2z" fill="#efd7b5" />
        <path d="M30 42a8 6 0 0 1 16 0z" fill="#b07a4f" />
        <path d="M37 42h2v5h-2z" fill="#efd7b5" />
        <path d="M38 76a8 6 0 0 1 16 0z" fill="#b07a4f" />
        <path d="M45 76h2v5h-2z" fill="#efd7b5" />
      </g>
      <g fill="#fff" stroke={INK} strokeWidth="1.6">
        <circle cx="62" cy="34" r="4" />
        <circle cx="72" cy="40" r="3.4" />
      </g>
      <path d="M44 30c4 6 2 12-3 15" fill="none" stroke="#7fb24a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function FlatbreadArt() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
      <rect x="14" y="22" width="72" height="66" rx="20" fill="#e9b47a" stroke={INK} strokeWidth="2.5" transform="rotate(-6 50 55)" />
      <rect x="22" y="30" width="56" height="50" rx="14" fill="#f3d9a4" stroke={INK} strokeWidth="1.6" transform="rotate(-6 50 55)" />
      <g fill="#fff" stroke={INK} strokeWidth="1.6">
        <circle cx="36" cy="42" r="5" />
        <circle cx="62" cy="64" r="5.5" />
        <circle cx="58" cy="40" r="4" />
      </g>
      <g fill="#b07a4f" stroke={INK} strokeWidth="1.6">
        <path d="M40 62a7 5 0 0 1 14 0z" />
        <path d="M64 48a7 5 0 0 1 14 0z" />
        <path d="M28 56a6 4.5 0 0 1 12 0z" />
      </g>
      <g fill="none" stroke="#4f9a3a" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="48" cy="50" r="2.6" />
        <circle cx="70" cy="72" r="2.6" />
        <circle cx="34" cy="70" r="2.6" />
        <circle cx="66" cy="30" r="2.4" />
      </g>
    </svg>
  );
}

const ARTS = [PastaArt, BowlArt, FlatbreadArt];
/** Soft backgrounds behind a drawn dish. */
const TINTS = ["#f0b98a", "#9fcb8a", "#f2cf78", "#bfd48e", "#e7d3b0"];

/** A stable number from a string, so the same recipe always gets the same drawing. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** What fills a recipe's square when there's no photo: a drawn dish on a tint, picked by recipe id. */
export function DishPlaceholder({ seed }: { seed: string }) {
  const h = hash(seed);
  const Art = ARTS[h % ARTS.length];
  return (
    <div aria-hidden="true" className="absolute inset-0" style={{ background: TINTS[h % TINTS.length] }}>
      <div className="absolute inset-[8%]">
        <Art />
      </div>
    </div>
  );
}
