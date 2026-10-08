import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { ChevronIcon } from "@/components/icons";
import { getEventsBetween } from "@/lib/events";
import { addDays, dayStartIso, formatDay, mondayOf, toLocalInputs, todayInCampus } from "@/lib/time";

import { DaySwiper } from "./day-swiper";
import type { WeekDay } from "./types";
import { WeekGrid } from "./week-grid";

export const metadata: Metadata = { title: "This week" };

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
  const { start } = await searchParams;
  const today = todayInCampus();
  const requested = typeof start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : today;
  const monday = mondayOf(requested);
  const thisMonday = mondayOf(today);

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
  const count = events.length;

  const weekLink = (date: string) => (date === thisMonday ? "/week" : `/week?start=${date}`);
  const navButton = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-white";

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh minutes={10} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-500">
            {monday === thisMonday ? "This week" : monday < thisMonday ? "Past week" : "Upcoming week"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            {formatDay(monday, "short")} – {formatDay(addDays(monday, 6), "short")}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {count === 0 ? "No free food announced yet." : `${count} event${count === 1 ? "" : "s"} with free food`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={weekLink(addDays(monday, -7))} className={navButton} aria-label="Previous week">
            <ChevronIcon direction="left" className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Link>
          {monday !== thisMonday && (
            <Link href="/week" className={navButton}>
              This week
            </Link>
          )}
          <Link href={weekLink(addDays(monday, 7))} className={navButton} aria-label="Next week">
            <span className="hidden sm:inline">Next</span>
            <ChevronIcon className="size-4" />
          </Link>
        </div>
      </div>

      <div className="md:hidden">
        <DaySwiper days={days} />
      </div>
      <div className="hidden md:block">
        <WeekGrid days={days} />
      </div>
    </div>
  );
}
