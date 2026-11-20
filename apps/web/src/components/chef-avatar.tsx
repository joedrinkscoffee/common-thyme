export function ChefAvatar({ size = 56 }: { size?: number }) {
  const icon = Math.round(size * 0.54);
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full border-2 border-ink bg-tomato shadow-pop-sm"
      style={{ width: size, height: size }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="#fff" stroke="#1f1a17" strokeWidth={1.4} strokeLinejoin="round">
        <path d="M7 14.5c-2.5-.4-4-2.3-4-4.4C3 7.8 5 6 7.2 6.2 7.9 4.3 9.8 3 12 3s4.1 1.3 4.8 3.2C19 6 21 7.8 21 10.1c0 2.1-1.5 4-4 4.4V19H7z" />
        <path d="M7 16.5h10" fill="none" />
      </svg>
    </span>
  );
}
