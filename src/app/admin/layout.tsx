import type { Metadata } from "next";
import Link from "next/link";

import { campus } from "@/lib/campus";

import { signOut } from "../login/actions";
import { NavLinks } from "./nav-links";

export const metadata: Metadata = { title: "Admin" };

// No session reads here: the shell renders instantly and each page checks
// the session inside its own <Suspense> boundary.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold tracking-tight">
              {campus.siteName}
            </Link>
            <NavLinks />
          </div>
          <form action={signOut}>
            <button type="submit" className="text-sm text-stone-600 hover:text-stone-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
