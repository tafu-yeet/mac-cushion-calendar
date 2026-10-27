"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { MenuIcon } from "@/components/icons";
import { TourButton } from "@/components/site-tour";

const LINKS = [
  { href: "/", label: "What's on", matches: (path: string) => path === "/" },
  { href: "/week", label: "Calendar", matches: (path: string) => path === "/week" || path === "/day" },
  // No room beside the wordmark on phones: there it's in the More menu.
  { href: "/communities", label: "Communities", matches: (path: string) => path === "/communities", wide: true },
] as const;

/** The nav with the current page highlighted. Reads the URL, so render it inside <Suspense>. */
export function SiteNav() {
  return <SiteNavLinks active={usePathname()} />;
}

/** The nav itself; without `active` nothing is highlighted (the Suspense fallback). */
export function SiteNavLinks({ active }: { active?: string }) {
  return (
    <nav className="flex items-center gap-1 sm:gap-1.5">
      {LINKS.map(({ href, label, matches, ...link }) => (
        <Link
          key={href}
          href={href}
          aria-current={active && matches(active) ? "page" : undefined}
          data-tour={href === "/week" ? "calendar" : undefined}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors sm:px-3.5 ${"wide" in link ? "hidden sm:inline-block" : ""} ${
            active && matches(active)
              ? "bg-maroon text-cream"
              : "text-maroon ring-1 ring-maroon/30 hover:bg-panel/60"
          }`}
        >
          {label}
        </Link>
      ))}
      <MoreMenu here={active === "/communities"} active={active} />
    </nav>
  );
}

const MENU_ITEM = "flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold hover:bg-canvas";

/** Phones only: the pages with no room in the bar. Closes on a pick, a tap outside, Escape, or a new page. */
function MoreMenu({ here, active }: { here: boolean; active?: string }) {
  const [open, setOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState(active);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // A new page closes it (adjusted while rendering, not in an effect).
  if (openedOn !== active) {
    setOpenedOn(active);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative sm:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className={`grid size-9 place-items-center rounded-full transition-colors ${here ? "bg-maroon text-cream" : "text-maroon ring-1 ring-maroon/30"}`}
      >
        <MenuIcon className="size-5" />
        <span className="sr-only">More pages</span>
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 top-full z-40 mt-2 flex w-52 flex-col rounded-2xl bg-panel p-1.5 text-maroon shadow-lg ring-1 ring-maroon/15">
          <Link href="/communities" aria-current={here ? "page" : undefined} onClick={() => setOpen(false)} className={MENU_ITEM}>
            Communities
          </Link>
          <div onClickCapture={() => setOpen(false)}>
            <TourButton className={MENU_ITEM} />
          </div>
        </div>
      )}
    </div>
  );
}
