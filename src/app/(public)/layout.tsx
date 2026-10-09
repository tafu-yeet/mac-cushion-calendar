import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { SiteNav, SiteNavLinks } from "@/components/site-nav";
import { campus } from "@/lib/campus";

// The wordmark is lowercase, like the logo: "mac cushion" over "calendar" on phones.
const [firstLine, secondLine] = (() => {
  const words = campus.siteName.toLowerCase().split(" ");
  return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
})();

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col bg-canvas font-body text-maroon">
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${campus.siteName}: what's on`}>
            <Image src="/logo-mark.png" alt="" width={36} height={36} className="size-9 rounded-full" priority />
            <span className="font-display text-[15px] font-semibold leading-[0.95] sm:text-lg sm:leading-none">
              {firstLine}
              <br className="sm:hidden" /> {secondLine}
            </span>
          </Link>
          <Suspense fallback={<SiteNavLinks />}>
            <SiteNav />
          </Suspense>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer>
        <p className="mx-auto max-w-5xl px-4 py-8 text-xs leading-relaxed text-maroon/65">
          A student project, not affiliated with {campus.school}. Events are read from clubs&apos; public Instagram
          posts by AI and double-checked before they appear here. Plans change, so check the club&apos;s post before
          you go.
        </p>
      </footer>
    </div>
  );
}
