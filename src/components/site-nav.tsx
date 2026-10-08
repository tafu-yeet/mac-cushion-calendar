"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "What's on" },
  { href: "/week", label: "Calendar" },
] as const;

/** The nav with the current page highlighted. Reads the URL, so render it inside <Suspense>. */
export function SiteNav() {
  return <SiteNavLinks active={usePathname()} />;
}

/** The nav itself; without `active` nothing is highlighted (the Suspense fallback). */
export function SiteNavLinks({ active }: { active?: string }) {
  return (
    <nav className="flex gap-1 rounded-full bg-stone-100 p-1">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-medium transition-colors sm:px-3 ${
            active === href ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
