"use client";

import Link from "next/link";

import { FilterBar, useFilters } from "@/components/filter-bar";
import { ChevronIcon } from "@/components/icons";
import { byStart, filterParams, matchesFilters, type Filters } from "@/lib/filters";
import { addDays, formatDay } from "@/lib/time";

import { DaySwiper } from "./day-swiper";
import type { WeekDay } from "./types";
import { WeekGrid } from "./week-grid";

/** One week of events, filtered: a time grid on desktop, a day swiper on phones. */
export function WeekBrowser({ days, monday, thisMonday, fromUrl }: { days: WeekDay[]; monday: string; thisMonday: string; fromUrl: Filters }) {
  const [filters, update] = useFilters(fromUrl);
  const shown = days.map((d) => ({ ...d, events: d.events.filter((e) => matchesFilters(e, filters)).sort(byStart) }));
  const count = shown.reduce((n, d) => n + d.events.length, 0);

  // Moving between weeks keeps the filters (day and time don't apply here).
  const weekLink = (start: string) => {
    const params = new URLSearchParams(filterParams({ ...filters, day: "today", time: null }));
    if (start !== thisMonday) params.set("start", start);
    const query = params.toString();
    return query ? `/week?${query}` : "/week";
  };
  const navButton =
    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-white";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-500">
            {monday === thisMonday ? "This week" : monday < thisMonday ? "Past week" : "Upcoming week"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            {formatDay(monday, "short")} – {formatDay(addDays(monday, 6), "short")}
          </h1>
          <p className="mt-1 text-sm text-stone-600" aria-live="polite">
            {count === 0 ? "Nothing announced that matches yet." : `${count} event${count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={weekLink(addDays(monday, -7))} className={navButton} aria-label="Previous week">
            <ChevronIcon direction="left" className="size-4" />
            <span className="hidden sm:inline">Previous</span>
          </Link>
          {monday !== thisMonday && (
            <Link href={weekLink(thisMonday)} className={navButton}>
              This week
            </Link>
          )}
          <Link href={weekLink(addDays(monday, 7))} className={navButton} aria-label="Next week">
            <span className="hidden sm:inline">Next</span>
            <ChevronIcon className="size-4" />
          </Link>
        </div>
      </div>

      <FilterBar filters={filters} update={update} />

      <div className="md:hidden">
        <DaySwiper days={shown} />
      </div>
      <div className="hidden md:block">
        <WeekGrid days={shown} />
      </div>
    </div>
  );
}
