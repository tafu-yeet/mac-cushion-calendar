"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { ChevronIcon } from "@/components/icons";

// The list page (with its filters) an event was opened from, for the event page's back link.
// Per tab, like the history it stands in for.
const KEY = "cushion-from";

/** Remembers which list page an event link was tapped on. Render once, in the layout. */
export function ListMemory() {
  useEffect(() => {
    const remember = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest('a[href^="/events/"]') : null;
      if (!link || location.pathname.startsWith("/events/")) return;
      try {
        sessionStorage.setItem(KEY, location.pathname + location.search);
      } catch {
        // Storage blocked: the back link goes home.
      }
    };
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);
  return null;
}

function savedList(): string {
  try {
    // Arriving from another site (a search result, a shared link) starts over.
    if (document.referrer && new URL(document.referrer).origin !== location.origin) return "/";
    const saved = sessionStorage.getItem(KEY);
    return saved && saved.startsWith("/") && !saved.startsWith("//") ? saved : "/";
  } catch {
    return "/";
  }
}

const noChanges = () => () => {};

function label(href: string): string {
  const path = href.split("?")[0];
  if (path === "/") return "What's on";
  if (path === "/week" || path === "/day") return "Calendar";
  if (path === "/communities") return "Communities";
  return "Back";
}

/** "‹ What's on", or "‹ Calendar" / "‹ Communities" with the filters the event was opened from. */
export function BackLink({ className }: { className?: string }) {
  const href = useSyncExternalStore(noChanges, savedList, () => "/");
  return (
    <Link href={href} className={className}>
      <ChevronIcon direction="left" className="size-4" />
      {label(href)}
    </Link>
  );
}
