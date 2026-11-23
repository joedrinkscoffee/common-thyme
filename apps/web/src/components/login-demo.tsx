"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChefAvatar } from "@/components/chef-avatar";

/*
  A small looping product demo for the sign-in page:
  you ask Chef → Chef drafts the week → shared ingredients get stickers → repeat.
  Pure CSS transitions driven by one step counter; no animation library.
*/

// When each step starts, in ms from the top of the loop.
const STEPS = [
  0, // 0: empty stage
  300, // 1: your message pops in
  1200, // 2: Chef is typing
  2300, // 3: Chef replies
  4200, // 4: chat clears, draft header pops in
  4550, // 5: Monday card
  4850, // 6: Tuesday card
  5150, // 7: Wednesday card
  6200, // 8: Kale × 2
  6700, // 9: Pesto × 2
  7200, // 10: Mushrooms × 2
  7700, // 11: Goat cheese × 2
  8700, // 12: summary stamp
  11400, // 13: fade everything out
];
const LOOP_MS = 12000;
const FINAL = 12; // the still frame shown when motion is reduced
const FADE = 13;

const DINNERS = [
  { day: "Mon", title: "Chicken pesto pasta", tint: "#f0b98a", tilt: -5, art: <PastaArt /> },
  { day: "Tue", title: "Kale & mushroom bowl", tint: "#9fcb8a", tilt: 3, art: <BowlArt /> },
  { day: "Wed", title: "Goat cheese flatbread", tint: "#f2cf78", tilt: -2, art: <FlatbreadArt /> },
];

// Each sticker sits across the gap between the two dinners that share it.
const STICKERS = [
  { label: "Kale × 2", color: "var(--color-kale)", left: "33%", top: "20%", tilt: -6, step: 8 },
  { label: "Pesto × 2", color: "#bfe08a", left: "33%", top: "50%", tilt: 5, step: 9 },
  { label: "Mushrooms × 2", color: "#f3c9a6", left: "67%", top: "26%", tilt: 4, step: 10 },
  { label: "Goat cheese × 2", color: "var(--color-lemon)", left: "67%", top: "56%", tilt: -4, step: 11 },
];

export function LoginDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timers: number[] = [];
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const run = () => {
      clear();
      if (reduce.matches) {
        setStep(FINAL);
        return;
      }
      STEPS.forEach((at, i) => timers.push(window.setTimeout(() => setStep(i), at)));
      timers.push(window.setTimeout(run, LOOP_MS));
    };
    run();
    reduce.addEventListener("change", run);
    return () => {
      clear();
      reduce.removeEventListener("change", run);
    };
  }, []);

  const on = (from: number, until = FADE) => step >= from && step < until;

  return (
    <div aria-hidden="true" className="login-demo" data-fading={step === FADE || undefined}>
      {/* Scene 1: the chat */}
      <div className="login-demo-chat" data-gone={step >= 4 || undefined}>
        <Pop on={on(1)} tilt={1.5} className="ml-auto w-fit max-w-[80%] origin-bottom-right">
          <div className="rounded-[18px] rounded-br-md border-2 border-ink bg-paper px-3.5 py-2.5 text-[15px] font-medium leading-snug shadow-pop-sm">
            Plan next week? We&apos;ve got kale to use up.
          </div>
        </Pop>
        <div className="mt-4 flex items-end gap-2.5">
          <Pop on={on(2)} className="origin-bottom">
            <ChefAvatar size={40} />
          </Pop>
          <div className="relative min-h-[64px] flex-1">
            <Pop on={on(2, 3)} className="absolute bottom-0 left-0 origin-bottom-left">
              <div className="flex gap-1.5 rounded-[18px] rounded-bl-md border-2 border-ink bg-lemon px-4 py-3.5 shadow-pop-sm">
                <span className="login-demo-dot" />
                <span className="login-demo-dot" style={{ animationDelay: "0.15s" }} />
                <span className="login-demo-dot" style={{ animationDelay: "0.3s" }} />
              </div>
            </Pop>
            <Pop on={on(3)} tilt={-1} className="absolute bottom-0 left-0 max-w-[92%] origin-bottom-left">
              <div className="rounded-[18px] rounded-bl-md border-2 border-ink bg-lemon px-3.5 py-2.5 text-[15px] font-medium leading-snug shadow-pop-sm">
                On it! Three dinners that share the shopping.
              </div>
            </Pop>
          </div>
        </div>
      </div>

      {/* Scene 2: the draft */}
      <div className="absolute inset-x-0 top-0">
        <Pop on={on(4)} tilt={-2} className="mx-auto w-fit origin-top">
          <div className="flex items-center gap-2 rounded-full border-2 border-ink bg-paper py-1 pl-1 pr-3.5 font-display text-sm font-extrabold shadow-pop-sm">
            <ChefAvatar size={26} />
            Chef&apos;s draft · next week
          </div>
        </Pop>
      </div>

      <div className="absolute inset-x-0 top-[64px]">
        <div className="relative grid grid-cols-3 gap-3.5">
          {DINNERS.map((d, i) => (
            <Pop key={d.day} on={on(5 + i)} tilt={d.tilt} className="origin-bottom">
              <div
                className="relative aspect-square rounded-[16px] border-2 border-ink shadow-pop"
                style={{ background: d.tint }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-[14px]">{d.art}</div>
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-paper px-1.5 text-[11px] font-extrabold uppercase leading-4">
                  {d.day}
                </span>
              </div>
              <div className="mt-2 text-center text-[12px] font-bold leading-tight">{d.title}</div>
            </Pop>
          ))}
          {STICKERS.map((s) => (
            <div key={s.label} className="absolute -translate-x-1/2" style={{ left: s.left, top: s.top }}>
              <Pop on={on(s.step)} tilt={s.tilt} sticker>
                <span
                  className="block whitespace-nowrap rounded-full border-2 border-ink px-2.5 py-1 text-[12.5px] font-extrabold leading-none shadow-pop-sm"
                  style={{ background: s.color }}
                >
                  {s.label}
                </span>
              </Pop>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-1">
        <Pop on={on(12)} tilt={-3} sticker className="mx-auto w-fit">
          <div className="rounded-[12px] border-2 border-ink bg-tomato px-3.5 py-1.5 font-display text-[15px] font-extrabold text-paper shadow-pop">
            4 buys, each used twice. Nothing wasted.
          </div>
        </Pop>
      </div>
    </div>
  );
}

function Pop({
  on,
  tilt = 0,
  sticker = false,
  className = "",
  children,
}: {
  on: boolean;
  tilt?: number;
  sticker?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`login-demo-pop ${className}`}
      data-on={on || undefined}
      data-sticker={sticker || undefined}
      style={{ "--tilt": `${tilt}deg` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/* Little flat-color dish drawings, Market Day style: thick ink outlines, no gradients. */

const INK = "#1f1a17";

function PastaArt() {
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

function BowlArt() {
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

function FlatbreadArt() {
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
