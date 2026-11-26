"use client";

// Small pieces of the motion system (src/app/motion.css) that need React.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { clientChanged, markClientChange, motionMs, motionValue, reducedMotion } from "@/lib/motion";

import { CheckIcon } from "./icons";

/**
 * Keeps a menu on screen a moment after it's closed, so it can play its way out. `shown` is what
 * to render (the last open value while closing) and `closing` is true for that moment. Opening
 * another one swaps straight to it.
 */
export function usePresence<T>(value: T | null): { shown: T | null; closing: boolean } {
  const [shown, setShown] = useState(value);
  if (value !== null && value !== shown) setShown(value);
  const closing = value === null && shown !== null;
  useEffect(() => {
    if (!closing) return;
    const done = setTimeout(() => setShown(null), motionMs("--motion-menu-out"));
    return () => clearTimeout(done);
  }, [closing]);
  return { shown, closing };
}

/**
 * The "on" look of a chip, wiped in from the left over its "off" look. Goes inside the chip
 * (which needs `relative`), with the chip's own content again and the same layout classes.
 */
export function WipeFill({ on, className, children }: { on: boolean; className: string; children: React.ReactNode }) {
  return (
    <span aria-hidden="true" data-on={on} className={`fill-wipe pointer-events-none absolute inset-0 ${className}`}>
      {children}
    </span>
  );
}

/**
 * Two labels in the same spot, like "Follow" and "Following": the one showing crossfades into
 * the other with a slight blur. The space is the wider one's, so nothing beside it moves.
 */
export function Swap({ on, off, children }: { on: boolean; off: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-grid">
      <span data-shown={!on} aria-hidden={on || undefined} className="swap-layer inline-flex items-center justify-center gap-1.5">
        {off}
      </span>
      <span data-shown={on} aria-hidden={!on || undefined} className="swap-layer inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </span>
  );
}

/** A checkmark that draws itself each time `drawn` goes up (someone just turned the thing on). */
export function DrawnCheck({ drawn, className = "size-4" }: { drawn: number; className?: string }) {
  return <CheckIcon key={drawn} className={`${className} ${drawn ? "draw-in" : ""}`} />;
}

/** One soft ring out from a button that just worked, each time `beat` goes up. Goes in the button, which needs `relative`. */
export function PulseRing({ beat }: { beat: number }) {
  if (!beat) return null;
  return <span key={beat} aria-hidden="true" className="pulse-ring pointer-events-none absolute inset-0 rounded-full ring-2 ring-current" />;
}

/**
 * A checkmark that draws itself when it appears after a tap. One that's there when the page
 * loads is simply there.
 */
export function AppearingCheck({ className = "size-3.5" }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!clientChanged() || reducedMotion()) return;
    ref.current?.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], {
      duration: motionMs("--motion-draw"),
      easing: motionValue("--ease-out"),
    });
  }, []);
  return (
    <span ref={ref} className="inline-flex">
      <CheckIcon className={className} />
    </span>
  );
}

/** A number that rolls to its new value: up from below when it grows, down from above when it shrinks. */
export function RollingNumber({ value }: { value: number | string }) {
  const [roll, setRoll] = useState({ value, previous: null as number | string | null, up: true, turn: 0 });
  if (roll.value !== value) setRoll({ value, previous: roll.value, up: Number(value) >= Number(roll.value), turn: roll.turn + 1 });
  const dir = { "--roll-dir": roll.up ? 1 : -1 } as React.CSSProperties;
  const rolling = "animate-[motion-roll-in_var(--motion-base)_var(--ease-out)_both]";
  return (
    <span className="inline-grid">
      {roll.previous !== null && (
        <span
          key={`out-${roll.turn}`}
          aria-hidden="true"
          style={dir}
          className="[grid-area:1/1] animate-[motion-roll-out_calc(var(--motion-base)*0.8)_var(--ease-in)_forwards]"
          onAnimationEnd={() => setRoll((r) => ({ ...r, previous: null }))}
        >
          {roll.previous}
        </span>
      )}
      <span key={`in-${roll.turn}`} style={dir} className={`[grid-area:1/1] ${roll.turn ? rolling : ""}`}>
        {roll.value}
      </span>
    </span>
  );
}

/** The logo: a small wobble when tapped, the site's one bit of bounce. */
export function Wobble({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const wobble = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("wobble");
    void el.offsetWidth; // restarts it if tapped again mid-wobble
    el.classList.add("wobble");
  };
  return (
    <span ref={ref} onPointerDown={wobble} onAnimationEnd={() => ref.current?.classList.remove("wobble")} className="inline-flex">
      {children}
    </span>
  );
}

/**
 * Notes when someone leaves for another page on the site (a link, the back button), so the next
 * page's entrance can play. Without this, nothing plays an entrance: what the server sent stays put.
 */
export function ClientChangeWatcher() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && link.origin === window.location.origin) markClientChange();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", markClientChange);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", markClientChange);
    };
  }, []);
  return null;
}

/**
 * A detail view's parts settling in one after another (title, then time and place, then buttons)
 * when it opens from somewhere else on the site. Its children are laid out as if it weren't there.
 */
export function Settle({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !clientChanged() || reducedMotion()) return;
    const duration = motionMs("--motion-slow");
    const stagger = motionMs("--motion-stagger");
    const easing = motionValue("--ease-out");
    const rise = motionValue("--motion-rise");
    [...el.children].forEach((child, i) =>
      child.animate([{ opacity: 0, translate: `0 ${rise}` }, { opacity: 1, translate: "0 0" }], { duration, delay: Math.min(i, 5) * stagger, easing, fill: "backwards" }),
    );
  }, []);
  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
