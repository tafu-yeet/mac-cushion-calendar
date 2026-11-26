import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { MemberSeed } from "@/components/member-provider";
import { campus } from "@/lib/campus";
import { getEventsBetween } from "@/lib/events";
import { PICKER_WEEKS, parseFilters, settleDay } from "@/lib/filters";
import { getMember } from "@/lib/member";
import { addDays, dayStartIso, todayInCampus } from "@/lib/time";

import { WhatsOn } from "./whats-on";

// Six weeks: everything "Next 7 days" and the day picker can show.
const DAYS_LOADED = PICKER_WEEKS * 7;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  // Proves ownership to Google Search Console, which looks for it on the home page.
  verification: { google: campus.googleSiteVerification },
};

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Suspense fallback={<FeedSkeleton />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The coming weeks' events and the filters in the URL. Reads the clock, so it runs per request. */
async function loadFeed(searchParams: PageProps<"/">["searchParams"]) {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const filters = settleDay(parseFilters(await searchParams), today);
  const usual = addDays(today, DAYS_LOADED);
  // A link to a day past the picker's range loads up to that day.
  const end = filters.day === "date" && filters.date >= usual ? addDays(filters.date, 1) : usual;
  // Signed out, getMember() returns at once without asking Supabase (no session cookie).
  const [events, member] = await Promise.all([getEventsBetween(dayStartIso(today), dayStartIso(end)), getMember()]);
  return { events, today, now, filters, member };
}

async function Feed({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { events, today, now, filters, member } = await loadFeed(searchParams);
  return (
    <MemberSeed member={member}>
      <AutoRefresh minutes={5} />
      <WhatsOn events={events} today={today} now={now} fromUrl={filters} />
    </MemberSeed>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading">
      <div className="skeleton h-4 w-40 rounded" />
      <div className="skeleton h-8 w-48 rounded" />
      <div className="skeleton h-11 rounded-xl" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-40 rounded-[28px]" />
      ))}
    </div>
  );
}
