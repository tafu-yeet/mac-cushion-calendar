"use client";

import Link from "next/link";

import { EventCard } from "@/components/event-card";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { ChevronIcon } from "@/components/icons";
import { campus } from "@/lib/campus";
import type { PublicEvent } from "@/lib/events";
import { DEFAULT_FILTERS, byStart, inWindow, isNarrowed, matchesFilters, timeWindow, type Filters } from "@/lib/filters";
import { addDays, formatDay, toLocalInputs } from "@/lib/time";

const COMING_UP_COUNT = 6;
// Without an end time, an event counts as on for this long after it starts.
const ASSUMED_LENGTH_MS = 90 * 60 * 1000;

function endMs(e: PublicEvent): number {
  return e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt) + ASSUMED_LENGTH_MS;
}

function isOnNow(e: PublicEvent, now: number): boolean {
  return e.startTimeKnown && Date.parse(e.startsAt) <= now && now < endMs(e);
}

type DayGroup = { date: string; fits: PublicEvent[]; timeUnknown: PublicEvent[] };

/** Everything on today, tomorrow, or this week that matches the filters. */
export function WhatsOn({ events, today, now, fromUrl }: { events: PublicEvent[]; today: string; now: number; fromUrl: Filters }) {
  const [filters, update] = useFilters(fromUrl);
  const slot = timeWindow(filters);
  const dateOf = (e: PublicEvent) => toLocalInputs(e.startsAt).date;

  // Today's timed events drop off once they're over; time-TBD ones stay all day.
  const matching = events
    .filter((e) => !(dateOf(e) === today && e.startTimeKnown && endMs(e) <= now))
    .filter((e) => matchesFilters(e, filters))
    .sort(byStart);

  const first = filters.day === "tomorrow" ? 1 : 0;
  const count = filters.day === "week" ? 7 : 1;
  const groups: DayGroup[] = Array.from({ length: count }, (_, i) => {
    const date = addDays(today, first + i);
    const onDay = matching.filter((e) => dateOf(e) === date);
    return {
      date,
      fits: onDay.filter((e) => inWindow(e, slot) === true),
      timeUnknown: onDay.filter((e) => inWindow(e, slot) === "unknown"),
    };
  });
  const total = groups.reduce((n, g) => n + g.fits.length, 0);
  const withFood = groups.reduce((n, g) => n + g.fits.filter((e) => e.hasFreeFood).length, 0);
  const lastShown = groups[groups.length - 1].date;
  const comingUp = matching.filter((e) => dateOf(e) > lastShown && inWindow(e, slot) !== false).slice(0, COMING_UP_COUNT);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-medium text-stone-500">{formatDay(today)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">What&apos;s on</h1>
        <p className="mt-1 text-stone-600">Every public {campus.schoolShortName} event in one place, from club posts.</p>
      </div>

      <FilterBar filters={filters} update={update} showWhen />

      <p className="text-sm text-stone-600" aria-live="polite">
        {total} event{total === 1 ? "" : "s"}
        {withFood > 0 && !filters.food && <span className="text-emerald-700"> · {withFood} with free food</span>}
      </p>

      {groups.map((g) => (
        <DaySection key={g.date} group={g} today={today} now={now} showHeading={filters.day === "week"} />
      ))}

      {total === 0 && (
        <EmptyState
          filters={filters}
          onClear={() => update({ ...DEFAULT_FILTERS, day: filters.day })}
          onTomorrow={() => update({ day: "tomorrow" })}
          hasComingUp={comingUp.length > 0}
        />
      )}

      {total === 0 && comingUp.length > 0 && (
        <Section title="Coming up">
          {comingUp.map((e) => (
            <EventCard key={e.id} event={e} showDate />
          ))}
        </Section>
      )}

      <Link href="/week" className="inline-flex items-center gap-1 self-start text-sm font-medium text-stone-700 hover:text-stone-900">
        See the week as a calendar
        <ChevronIcon className="size-4" />
      </Link>
    </div>
  );
}

function DaySection({ group, today, now, showHeading }: { group: DayGroup; today: string; now: number; showHeading: boolean }) {
  if (!group.fits.length && !group.timeUnknown.length) return null;
  return (
    <section className="flex flex-col gap-3">
      {showHeading && (
        <h2 className="text-sm font-semibold text-stone-800">
          {formatDay(group.date)}
          {group.date === today && <span className="ml-2 text-emerald-700">Today</span>}
        </h2>
      )}
      {group.fits.map((e) => (
        <EventCard key={e.id} event={e} live={isOnNow(e, now)} />
      ))}
      {group.timeUnknown.length > 0 && (
        <details className="group rounded-xl border border-dashed border-stone-300 px-4 py-2">
          <summary className="cursor-pointer text-sm text-stone-600">
            {group.timeUnknown.length} more with no time announced yet
          </summary>
          <div className="mt-3 flex flex-col gap-3 pb-2">
            {group.timeUnknown.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function EmptyState({
  filters,
  onClear,
  onTomorrow,
  hasComingUp,
}: {
  filters: Filters;
  onClear: () => void;
  onTomorrow: () => void;
  hasComingUp: boolean;
}) {
  const narrowed = isNarrowed(filters);
  const button = "mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50";
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-center">
      <p className="text-lg font-semibold text-stone-900">
        {narrowed ? "Nothing matches" : filters.day === "today" ? "Nothing else on today" : "Nothing announced yet"}
      </p>
      <p className="mt-1 text-sm text-stone-600">
        {narrowed
          ? "Try another time or category."
          : hasComingUp
            ? "Here's what's coming up next."
            : "Clubs usually post a few days ahead. Check back soon."}
      </p>
      {narrowed ? (
        <button type="button" onClick={onClear} className={button}>
          Clear filters
        </button>
      ) : (
        filters.day === "today" && (
          <button type="button" onClick={onTomorrow} className={button}>
            See tomorrow
          </button>
        )
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">{title}</h2>
      {children}
    </section>
  );
}
