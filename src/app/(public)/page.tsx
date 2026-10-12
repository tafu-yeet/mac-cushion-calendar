import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { getEventsBetween } from "@/lib/events";
import { PICKER_WEEKS, parseFilters, settleDay } from "@/lib/filters";
import { addDays, dayStartIso, todayInCampus } from "@/lib/time";

import { WhatsOn } from "./whats-on";

// Six weeks: everything "Next 7 days" and the day picker can show.
const DAYS_LOADED = PICKER_WEEKS * 7;

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
  const events = await getEventsBetween(dayStartIso(today), dayStartIso(end));
  return { events, today, now, filters };
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
