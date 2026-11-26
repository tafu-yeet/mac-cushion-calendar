"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { InstagramIcon, MenuIcon } from "@/components/icons";
import { useMember } from "@/components/member-provider";
import { usePresence } from "@/components/motion";
import { TourButton } from "@/components/site-tour";
import { campus } from "@/lib/campus";

const LINKS = [
  // The smallest phones (under 360px) drop it to fit Sign in: the logo goes home too.
  { href: "/", label: "What's on", matches: (path: string) => path === "/" },
  { href: "/week", label: "Calendar", matches: (path: string) => path === "/week" || path === "/day" },
  // No room beside the wordmark on phones: there it's in the More menu.
  { href: "/communities", label: "Communities", matches: (path: string) => path === "/communities", wide: true },
  { href: "/clubs", label: "Clubs", matches: (path: string) => path === "/clubs" || path.startsWith("/clubs/"), wide: true },
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
          transitionTypes={["nav"]}
          aria-current={active && matches(active) ? "page" : undefined}
          data-tour={href === "/week" ? "calendar" : undefined}
          className={`press whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold sm:px-3.5 ${"wide" in link ? "hidden sm:inline-block" : ""} ${href === "/" ? "max-[359px]:hidden" : ""} ${
            active && matches(active)
              ? "bg-maroon text-cream"
              : "text-maroon ring-1 ring-maroon/30 hover:bg-panel/60"
          }`}
        >
          {label}
        </Link>
      ))}
      <AccountLink active={active} />
      <MoreMenu here={!!active && (active === "/communities" || active === "/clubs" || active.startsWith("/clubs/"))} active={active} />
    </nav>
  );
}

const isAccountPage = (path?: string) => !!path && (path === "/account" || path.startsWith("/account/") || path === "/sign-in");

/** The first letter of the member's name or email, for their round account button. */
const initialOf = (name: string | null, email: string | null) => (name ?? email ?? "?").trim().charAt(0).toUpperCase() || "?";

/** "Sign in", or the member's initial linking to their account: in the bar on every screen, so phones see it without opening the menu. */
function AccountLink({ active }: { active?: string }) {
  const { member } = useMember();
  const current = isAccountPage(active);
  if (!member) {
    return (
      <Link
        href="/sign-in"
        aria-current={active === "/sign-in" ? "page" : undefined}
        className={`press whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold sm:px-3.5 ${current ? "bg-maroon text-cream" : "bg-gold text-maroon hover:bg-butter"}`}
      >
        Sign in
      </Link>
    );
  }
  return (
    <Link
      href="/account"
      aria-current={current ? "page" : undefined}
      title="Your account"
      transitionTypes={["nav"]}
      className={`press grid size-9 shrink-0 place-items-center rounded-full font-display text-base font-semibold ${current ? "bg-maroon text-cream" : "bg-gold text-maroon hover:bg-butter"}`}
    >
      {initialOf(member.name, member.email)}
      <span className="sr-only">Your account</span>
    </Link>
  );
}

const MENU_ITEM = "press flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold hover:bg-canvas";

/** Phones only: the pages with no room in the bar. Closes on a pick, a tap outside, Escape, or a new page. */
function MoreMenu({ here, active }: { here: boolean; active?: string }) {
  const [open, setOpen] = useState(false);
  const { shown, closing } = usePresence(open || null);
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
        className={`press relative grid size-9 shrink-0 place-items-center rounded-full ${here ? "bg-maroon text-cream" : "text-maroon ring-1 ring-maroon/30"}`}
      >
        <MenuIcon className="size-5" />
        <span className="sr-only">More pages</span>
      </button>
      {shown && (
        <div
          id={menuId}
          data-closing={closing || undefined}
          inert={closing}
          className="pop origin-top-right absolute right-0 top-full z-40 mt-2 flex w-52 flex-col rounded-2xl bg-panel p-1.5 text-maroon shadow-lg ring-1 ring-maroon/15"
        >
          <Link href="/communities" transitionTypes={["nav"]} aria-current={active === "/communities" ? "page" : undefined} onClick={() => setOpen(false)} className={MENU_ITEM}>
            Communities
          </Link>
          <Link href="/clubs" transitionTypes={["nav"]} aria-current={active === "/clubs" ? "page" : undefined} onClick={() => setOpen(false)} className={MENU_ITEM}>
            Clubs
          </Link>
          <div onClickCapture={() => setOpen(false)}>
            <TourButton className={MENU_ITEM} />
          </div>
          <a href={`https://www.instagram.com/${campus.instagram}/`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={`${MENU_ITEM} gap-2`}>
            <InstagramIcon className="size-4" />@{campus.instagram}
          </a>
        </div>
      )}
    </div>
  );
}
