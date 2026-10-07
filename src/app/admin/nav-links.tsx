"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Review queue" },
  { href: "/admin/clubs", label: "Clubs" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
