import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { getEventsBetween } from "@/lib/events";
import { parseFilters } from "@/lib/filters";
import { addDays, dayStartIso, mondayOf, todayInCampus } from "@/lib/time";

import { WeekBrowser } from "./week-browser";
import { weekDays } from "./week-days";

export const metadata: Metadata = { title: "Calendar" };

export default function WeekPage({ searchParams }: PageProps<"/week">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[28px] bg-maroon/10" aria-label="Loading" />}>
        <Week searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Week({ searchParams }: { searchParams: PageProps<"/week">["searchParams"] }) {
  await connection();
  const params = await searchParams;
  const today = todayInCampus();
  const requested = typeof params.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.start) ? params.start : today;
  const monday = mondayOf(requested);

  const events = await getEventsBetween(dayStartIso(monday), dayStartIso(addDays(monday, 7)));
  const days = weekDays(monday, today, events);

  return (
    <>
      <AutoRefresh minutes={10} />
      <WeekBrowser days={days} monday={monday} thisMonday={mondayOf(today)} today={today} fromUrl={parseFilters(params)} />
    </>
  );
}
