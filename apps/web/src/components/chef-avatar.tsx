/** Chef: the thyme sprig from the app icon, with a face and a little toque. */
export function ChefAvatar({ size = 56 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" className="flex-none">
      <rect x="2.5" y="2.5" width="59" height="59" rx="18" fill="#ffe066" stroke="#1f1a17" strokeWidth="3.5" />
      <path d="M32 56V22" stroke="#1f1a17" strokeWidth="3.5" strokeLinecap="round" />
      <g fill="#7cc576" stroke="#1f1a17" strokeWidth="2.8" strokeLinejoin="round">
        <path d="M30 49c-8 1-14-3-15-9 7-1 13 2 15 9z" />
        <path d="M34 49c8 1 14-3 15-9-7-1-13 2-15 9z" />
        <path d="M30 37c-7 1-12-3-13-8 6-1 11 2 13 8z" />
        <path d="M34 37c7 1 12-3 13-8-6-1-11 2-13 8z" />
      </g>
      {/* Face */}
      <circle cx="27" cy="24" r="2.3" fill="#1f1a17" />
      <circle cx="37" cy="24" r="2.3" fill="#1f1a17" />
      <path d="M27.5 29q4.5 3.5 9 0" fill="none" stroke="#1f1a17" strokeWidth="2.3" strokeLinecap="round" />
      {/* Toque */}
      <path d="M21 15c-3-1-3-7 2-7 1-4 7-5 9-2 2-3 8-2 9 2 5 0 5 6 2 7l-1 3H22z" fill="#fff" stroke="#1f1a17" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}
