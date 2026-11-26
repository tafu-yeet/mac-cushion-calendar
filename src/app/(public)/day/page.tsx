import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { CardsSkeleton } from "@/components/skeleton";
import { getEventsBetween } from "@/lib/events";
import { parseFilters } from "@/lib/filters";
import { addDays, dayStartIso, mondayOf, todayInCampus } from "@/lib/time";

import { weekDays } from "../week/week-days";
import { DayBrowser } from "./day-browser";

export const metadata: Metadata = { title: "Day", alternates: { canonical: "/day" } };

export default function DayPage({ searchParams }: PageProps<"/day">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Suspense fallback={<CardsSkeleton />}>
        <Day searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The requested day's week of events. Reads the clock, so it runs per request. */
async function loadDay(searchParams: PageProps<"/day">["searchParams"]) {
  await connection();
  const now = Date.now();
  const params = await searchParams;
  const today = todayInCampus();
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const monday = mondayOf(date);
  const events = await getEventsBetween(dayStartIso(monday), dayStartIso(addDays(monday, 7)));
  return { days: weekDays(monday, today, events), date, today, now, filters: parseFilters(params) };
}

async function Day({ searchParams }: { searchParams: PageProps<"/day">["searchParams"] }) {
  const { days, date, today, now, filters } = await loadDay(searchParams);
  return (
    <>
      <AutoRefresh minutes={5} />
      <DayBrowser days={days} date={date} today={today} now={now} fromUrl={filters} />
    </>
  );
}
