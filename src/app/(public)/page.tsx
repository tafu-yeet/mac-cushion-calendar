import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { getEventsBetween } from "@/lib/events";
import { parseFilters } from "@/lib/filters";
import { addDays, dayStartIso, todayInCampus } from "@/lib/time";

import { WhatsOn } from "./whats-on";

// Today plus the next six days: everything "Next 7 days" can show.
const DAYS_LOADED = 7;

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Suspense fallback={<FeedSkeleton />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The week's events and the filters in the URL. Reads the clock, so it runs per request. */
async function loadFeed(searchParams: PageProps<"/">["searchParams"]) {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const [events, params] = await Promise.all([
    getEventsBetween(dayStartIso(today), dayStartIso(addDays(today, DAYS_LOADED))),
    searchParams,
  ]);
  return { events, today, now, filters: parseFilters(params) };
}

async function Feed({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { events, today, now, filters } = await loadFeed(searchParams);
  return (
    <>
      <AutoRefresh minutes={5} />
      <WhatsOn events={events} today={today} now={now} fromUrl={filters} />
    </>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-label="Loading">
      <div className="h-4 w-40 rounded bg-maroon/10" />
      <div className="h-8 w-48 rounded bg-maroon/10" />
      <div className="h-11 rounded-xl bg-maroon/10" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 rounded-2xl bg-maroon/10" />
      ))}
    </div>
  );
}
