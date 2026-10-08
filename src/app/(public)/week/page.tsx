import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { getEventsBetween } from "@/lib/events";
import { parseFilters } from "@/lib/filters";
import { addDays, dayStartIso, formatDay, mondayOf, toLocalInputs, todayInCampus } from "@/lib/time";

import type { WeekDay } from "./types";
import { WeekBrowser } from "./week-browser";

export const metadata: Metadata = { title: "Calendar" };

export default function WeekPage({ searchParams }: PageProps<"/week">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-stone-200/70" aria-label="Loading" />}>
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
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      date,
      weekday: formatDay(date, "short").split(",")[0],
      dayOfMonth: Number(date.slice(8)),
      label: formatDay(date),
      isToday: date === today,
      events: events.filter((e) => toLocalInputs(e.startsAt).date === date),
    };
  });

  return (
    <>
      <AutoRefresh minutes={10} />
      <WeekBrowser days={days} monday={monday} thisMonday={mondayOf(today)} fromUrl={parseFilters(params)} />
    </>
  );
}
