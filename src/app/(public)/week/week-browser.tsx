"use client";

import { FilterBar, useFilters } from "@/components/filter-bar";
import { byStart, matchesFilters, type Filters } from "@/lib/filters";
import { addDays } from "@/lib/time";

import { CalendarHeader, calendarHref, monthDay, weekRange } from "../calendar-header";
import { DayCard } from "./day-card";
import type { WeekDay } from "./types";

/** One week as a stack of day cards, filtered. */
export function WeekBrowser({
  days,
  monday,
  thisMonday,
  today,
  fromUrl,
}: {
  days: WeekDay[];
  monday: string;
  thisMonday: string;
  today: string;
  fromUrl: Filters;
}) {
  const [filters, update] = useFilters(fromUrl);
  const shown = days.map((d) => ({ ...d, events: d.events.filter((e) => matchesFilters(e, filters)).sort(byStart) }));
  const count = shown.reduce((n, d) => n + d.events.length, 0);
  const withFood = shown.reduce((n, d) => n + d.events.filter((e) => e.hasFreeFood).length, 0);

  const week = (start: string) => calendarHref("week", start === thisMonday ? null : start, filters);
  const day = (date: string) => calendarHref("day", date === today ? null : date, filters);
  const prevMonday = addDays(monday, -7);
  const nextMonday = addDays(monday, 7);
  // The day view opens on today when this week is showing, otherwise on the week's Monday.
  const openDay = monday === thisMonday ? today : monday;

  return (
    <div className="flex flex-col gap-5">
      <CalendarHeader
        view="week"
        weekHref={week(monday)}
        dayHref={day(openDay)}
        todayHref={week(thisMonday)}
        atToday={monday === thisMonday}
        prev={{ label: monthDay(prevMonday, today), href: week(prevMonday) }}
        current={weekRange(monday, addDays(monday, 6), today)}
        next={{ label: monthDay(nextMonday, today), href: week(nextMonday) }}
      />

      <div className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="font-display text-xl font-semibold lowercase">
          {monday === thisMonday ? "This week" : monday < thisMonday ? "Past week" : "Coming week"}
        </h1>
        <p className="text-sm text-maroon/75" aria-live="polite">
          {count === 0 ? "Nothing that matches yet" : `${count} event${count === 1 ? "" : "s"}`}
          {withFood > 0 && ` · ${withFood} with free food`}
        </p>
      </div>

      <FilterBar filters={filters} update={update} />

      <div className="flex flex-col gap-3">
        {shown.map((d) => (
          <DayCard key={d.date} day={d} dayHref={day(d.date)} today={today} />
        ))}
      </div>
    </div>
  );
}
