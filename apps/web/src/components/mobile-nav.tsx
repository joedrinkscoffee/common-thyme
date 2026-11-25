"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type NavItem = { href: string; label: string; active: boolean };

/**
 * Phone-width nav: one Menu button that opens a card under the header. The card
 * floats over the page, so opening it never moves anything. Escape, a tap
 * outside, or picking a page closes it, and focus goes back to the button.
 */
export function MobileNav({ items, showSignOut, extra = null }: { items: NavItem[]; showSignOut: boolean; extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    }
    // Close if the screen grows past the phone breakpoint while open.
    const wide = window.matchMedia("(min-width: 48rem)");
    function onWide() {
      if (wide.matches) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={[
          "relative z-50 flex shrink-0 items-center gap-2 rounded-full border-2 border-ink px-3.5 py-2 font-semibold text-ink",
          "shadow-pop-sm transition-[translate,box-shadow,background-color] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
          "motion-reduce:transition-none",
          open ? "bg-lemon" : "bg-paper hover:bg-lemon",
        ].join(" ")}
      >
        <Burger open={open} />
        <span className="max-[359px]:sr-only">Menu</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink/25 motion-safe:animate-[mobile-nav-fade_0.15s_ease-out]" aria-hidden="true" />
      )}

      <div
        ref={panelRef}
        id={panelId}
        hidden={!open}
        className="absolute inset-x-4 top-[4.25rem] z-50 rounded-2xl border-2 border-ink bg-paper p-2 shadow-pop-lg motion-safe:animate-[mobile-nav-drop_0.18s_cubic-bezier(0.2,0.8,0.2,1)]"
      >
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={[
                    "flex items-center justify-between rounded-xl px-4 py-3 text-lg font-semibold no-underline",
                    item.active ? "bg-ink text-cream" : "text-ink transition-colors hover:bg-lemon focus-visible:bg-lemon",
                  ].join(" ")}
                >
                  {item.label}
                  {item.active && <span className="text-sm font-medium text-cream/70">You&rsquo;re here</span>}
                </Link>
              </li>
            ))}
            {extra && <li onClick={() => setOpen(false)}>{extra}</li>}
          </ul>
        </nav>
        {showSignOut && (
          <form action="/auth/sign-out" method="post" className="mt-2 border-t-2 border-dashed border-dash pt-2">
            <button
              type="submit"
              className="w-full rounded-xl px-4 py-3 text-left font-semibold text-muted transition-colors hover:bg-lemon hover:text-ink"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Burger({ open }: { open: boolean }) {
  const bar = "absolute left-0 h-[2.5px] w-full rounded-full bg-ink transition-[translate,rotate,opacity] duration-200 motion-reduce:transition-none";
  return (
    <span aria-hidden="true" className="relative block h-3.5 w-5">
      <span className={`${bar} top-0 ${open ? "translate-y-[5.75px] rotate-45" : ""}`} />
      <span className={`${bar} top-[5.75px] ${open ? "opacity-0" : ""}`} />
      <span className={`${bar} top-[11.5px] ${open ? "-translate-y-[5.75px] -rotate-45" : ""}`} />
    </span>
  );
}
