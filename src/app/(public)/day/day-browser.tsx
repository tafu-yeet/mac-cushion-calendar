"use client";

import Link from "next/link";

import { BigDate, DateStats } from "@/components/big-date";
import { EventCard } from "@/components/event-card";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { useNow } from "@/components/use-now";
import { byStart, matchesFilters, type Filters } from "@/lib/filters";
import { addDays, dateParts, mondayOf } from "@/lib/time";

import { CalendarHeader, calendarHref, dayLabel, shortDay } from "../calendar-header";
import type { WeekDay } from "../week/types";
import { DayTimeline } from "./day-timeline";

/** One day on an hour timeline, with the rest of its week a tap away. */
export function DayBrowser({
  days,
  date,
  today,
  now: serverNow,
  fromUrl,
}: {
  days: WeekDay[]; // the week containing `date`
  date: string;
  today: string;
  now: number;
  fromUrl: Filters;
}) {
  const [filters, update] = useFilters(fromUrl);
  const now = useNow(serverNow);
  const shown = days.map((d) => ({ ...d, events: d.events.filter((e) => matchesFilters(e, filters)).sort(byStart) }));
  const selected = shown.find((d) => d.date === date) ?? shown[0];
  const timed = selected.events.filter((e) => e.startTimeKnown);
  const untimed = selected.events.filter((e) => !e.startTimeKnown);
  const withFood = selected.events.filter((e) => e.hasFreeFood).length;

  const day = (d: string) => calendarHref("day", d === today ? null : d, filters);
  const monday = mondayOf(date);
  const isToday = date === today;

  return (
    <div className="flex flex-col gap-5">
      <CalendarHeader
        view="day"
        weekHref={calendarHref("week", monday === mondayOf(today) ? null : monday, filters)}
        dayHref={day(date)}
        todayHref={day(today)}
        atToday={isToday}
        prev={{ label: shortDay(addDays(date, -1)), href: day(addDays(date, -1)) }}
        current={dayLabel(date, today)}
        next={{ label: shortDay(addDays(date, 1)), href: day(addDays(date, 1)) }}
      />

      <div className="flex items-end justify-between gap-4">
        <BigDate date={date} today={today} label={isToday ? `${dateParts(date).weekday} · Today` : undefined} />
        <DateStats
          stats={[
            { value: selected.events.length, label: `event${selected.events.length === 1 ? "" : "s"}` },
            { value: withFood, label: "with free food" },
          ]}
        />
      </div>

      <nav aria-label="Days this week" className="grid grid-cols-7 gap-1.5">
        {shown.map((d) => {
          const active = d.date === date;
          return (
            <Link
              key={d.date}
              href={day(d.date)}
              aria-current={active ? "date" : undefined}
              className={`flex flex-col items-center rounded-2xl py-2 text-xs transition-colors ${
                active
                  ? "bg-maroon text-cream"
                  : d.isToday
                    ? "bg-panel text-maroon ring-1 ring-maroon"
                    : "bg-panel/60 text-maroon/80 hover:bg-panel"
              }`}
            >
              <span className="font-medium">{d.weekday}</span>
              <span className="font-display text-lg font-semibold leading-tight">{d.dayOfMonth}</span>
              <span
                className={`mt-0.5 size-1.5 rounded-full ${d.events.length ? (active ? "bg-gold" : "bg-maroon/50") : "bg-transparent"}`}
              />
            </Link>
          );
        })}
      </nav>

      <FilterBar filters={filters} update={update} />

      <section className="rounded-[32px] bg-panel p-4 shadow-sm sm:p-6">
        <h1 className="mb-5 font-display text-xl font-semibold lowercase">{selected.label}</h1>
        {timed.length ? (
          <DayTimeline date={date} events={timed} now={isToday ? now : null} />
        ) : (
          <p className="rounded-[28px] bg-canvas px-5 py-10 text-center text-sm text-maroon/75">
            {untimed.length ? "Nothing with a set time yet." : "Nothing announced for this day yet."}
          </p>
        )}
      </section>

      {untimed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="px-1 font-display text-base font-semibold">No time announced yet</h2>
          {untimed.map((e) => (
            <EventCard key={e.id} event={e} now={now} />
          ))}
        </section>
      )}
    </div>
  );
}
