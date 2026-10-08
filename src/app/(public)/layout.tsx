import Link from "next/link";
import { Suspense } from "react";

import { SiteNav, SiteNavLinks } from "@/components/site-nav";
import { campus } from "@/lib/campus";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight text-stone-900">
            {campus.siteName}
          </Link>
          <Suspense fallback={<SiteNavLinks />}>
            <SiteNav />
          </Suspense>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-stone-200">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-stone-500">
          A student project, not affiliated with {campus.school}. Events are read from clubs&apos; public Instagram
          posts by AI and double-checked before they appear here. Plans change, so check the club&apos;s post before
          you go.
        </p>
      </footer>
    </div>
  );
}
