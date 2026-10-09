"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "What's on", matches: (path: string) => path === "/" },
  { href: "/week", label: "Calendar", matches: (path: string) => path === "/week" || path === "/day" },
] as const;

/** The nav with the current page highlighted. Reads the URL, so render it inside <Suspense>. */
export function SiteNav() {
  return <SiteNavLinks active={usePathname()} />;
}

/** The nav itself; without `active` nothing is highlighted (the Suspense fallback). */
export function SiteNavLinks({ active }: { active?: string }) {
  return (
    <nav className="flex gap-1.5">
      {LINKS.map(({ href, label, matches }) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
            active && matches(active)
              ? "bg-maroon text-cream"
              : "text-maroon ring-1 ring-maroon/30 hover:bg-panel/60"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
