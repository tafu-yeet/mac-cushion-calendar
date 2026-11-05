"use client";

import { useTransition } from "react";

import { setHighlighted } from "./actions";

/** Bumps an event to the top of its day on the site, or stops; the Stats page shows how it does. */
export function HighlightToggle({ id, highlighted }: { id: number; highlighted: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={highlighted}
      onClick={() => start(() => setHighlighted(id, !highlighted))}
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-60 ${
        highlighted ? "bg-amber-400 text-amber-950 hover:bg-amber-300" : "text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
      }`}
    >
      {highlighted ? "★ Highlighted (stop)" : "☆ Highlight"}
    </button>
  );
}
