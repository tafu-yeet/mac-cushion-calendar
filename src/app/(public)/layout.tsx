// The plain React version: the Next.js one waits on useSearchParams inside a Suspense
// boundary that never resolves on these partly prerendered pages, so it never loaded.
import { Analytics } from "@vercel/analytics/react";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { SiteNav, SiteNavLinks } from "@/components/site-nav";
import { TourButton } from "@/components/site-tour";
import { campus } from "@/lib/campus";

import { FeedbackLink, FeedbackProvider } from "./feedback";

// The wordmark is lowercase, like the logo: "mac cushion" over "calendar" on phones.
const [firstLine, secondLine] = (() => {
  const words = campus.siteName.toLowerCase().split(" ");
  return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
})();

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <FeedbackProvider>
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

        <footer className="mx-auto w-full max-w-5xl px-4 py-8">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <TourButton className="text-sm font-semibold text-maroon underline underline-offset-2 hover:text-plum" />
            <FeedbackLink type="idea" className="text-sm font-semibold text-maroon underline underline-offset-2 hover:text-plum">
              Send feedback
            </FeedbackLink>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-maroon/65">
            A student project, not affiliated with {campus.school}. Events are read from clubs&apos; public Instagram
            posts by AI and double-checked before they appear here. Plans change, so check the club&apos;s post before
            you go.
          </p>
        </footer>
        {/* Visitor counts (pages, referrers) in the Vercel dashboard: no cookies, nothing personal. */}
        <Analytics />
      </div>
    </FeedbackProvider>
  );
}
