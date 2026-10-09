"use client";

import Link from "next/link";

import { ChevronIcon, TodayIcon } from "@/components/icons";
import { filterParams, type Filters } from "@/lib/filters";

export type CalendarView = "week" | "day";

/**
 * A link to a calendar view that keeps the current filters. `date` is the
 * week's Monday (week view) or the day (day view); null means the current one.
 */
export function calendarHref(view: CalendarView, date: string | null, filters: Filters): string {
  // Day and time window belong to the home page's list, not the calendar.
  const params = new URLSearchParams(filterParams({ ...filters, day: "today", time: null }));
  if (date) params.set(view === "week" ? "start" : "date", date);
  const query = params.toString();
  return `/${view}${query ? `?${query}` : ""}`;
}

type Step = { label: string; href: string };

/** Week / Day pills, a jump-to-today button, and the "SEP 28 ‹ OCT 5–11 › OCT 12" switcher. */
export function CalendarHeader({
  view,
  weekHref,
  dayHref,
  todayHref,
  atToday,
  prev,
  current,
  next,
}: {
  view: CalendarView;
  weekHref: string;
  dayHref: string;
  todayHref: string;
  atToday: boolean;
  prev: Step;
  current: string;
  next: Step;
}) {
  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-maroon text-cream" : "text-maroon ring-1 ring-maroon/30 hover:bg-panel/60"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="Calendar view">
          <Link href={weekHref} role="tab" aria-selected={view === "week"} className={pill(view === "week")}>
            Week
          </Link>
          <Link href={dayHref} role="tab" aria-selected={view === "day"} className={pill(view === "day")}>
            Day
          </Link>
        </div>
        <Link
          href={todayHref}
          aria-label={view === "week" ? "This week" : "Today"}
          title={view === "week" ? "This week" : "Today"}
          className={`grid size-9 place-items-center rounded-full transition-colors ${
            atToday ? "text-maroon/40 ring-1 ring-maroon/20" : "bg-panel text-maroon shadow-sm hover:bg-white"
          }`}
        >
          <TodayIcon className="size-[18px]" />
        </Link>
      </div>

      <nav aria-label={view === "week" ? "Weeks" : "Days"} className="flex items-center justify-between rounded-full bg-panel px-2 py-1.5 shadow-sm">
        <Link href={prev.href} className="flex min-w-0 items-center gap-1 rounded-full px-3 py-1 text-maroon/50 hover:text-maroon">
          <ChevronIcon direction="left" className="size-4 shrink-0" />
          <span className="truncate text-sm font-medium uppercase tracking-wider sm:text-base">{prev.label}</span>
        </Link>
        <span className="shrink-0 px-2 text-center font-display text-base font-semibold uppercase tracking-wide sm:text-lg">{current}</span>
        <Link href={next.href} className="flex min-w-0 items-center justify-end gap-1 rounded-full px-3 py-1 text-maroon/50 hover:text-maroon">
          <span className="truncate text-sm font-medium uppercase tracking-wider sm:text-base">{next.label}</span>
          <ChevronIcon className="size-4 shrink-0" />
        </Link>
      </nav>
    </div>
  );
}

const fmt = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${date}T12:00:00Z`));

/** "Oct 12" */
export const monthDay = (date: string) => fmt(date, { month: "short", day: "numeric" });

/** "Oct 5–11", or "Sep 28 – Oct 4" across months. */
export function weekRange(monday: string, sunday: string): string {
  const sameMonth = monday.slice(5, 7) === sunday.slice(5, 7);
  return sameMonth ? `${monthDay(monday)}–${Number(sunday.slice(8))}` : `${monthDay(monday)} – ${monthDay(sunday)}`;
}

/** "Thu 8" */
export const shortDay = (date: string) => `${fmt(date, { weekday: "short" })} ${Number(date.slice(8))}`;

/** "Fri, Oct 9" */
export const dayLabel = (date: string) => `${fmt(date, { weekday: "short" })}, ${monthDay(date)}`;
