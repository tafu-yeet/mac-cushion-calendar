"use client";

import Link from "next/link";

import { BigDate, DateStats } from "@/components/big-date";
import { EventCard } from "@/components/event-card";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { ChevronIcon } from "@/components/icons";
import { useNow } from "@/components/use-now";
import { campus } from "@/lib/campus";
import type { PublicEvent } from "@/lib/events";
import { DAYS, DEFAULT_FILTERS, byStart, inWindow, isNarrowed, matchesFilters, timeWindow, type Filters } from "@/lib/filters";
import { endMs } from "@/lib/status";
import { addDays, formatDay, toLocalInputs } from "@/lib/time";

const COMING_UP_COUNT = 6;

type DayGroup = { date: string; fits: PublicEvent[]; timeUnknown: PublicEvent[] };

/** Everything on today, tomorrow, or this week that matches the filters. */
export function WhatsOn({ events, today, now: serverNow, fromUrl }: { events: PublicEvent[]; today: string; now: number; fromUrl: Filters }) {
  const [filters, update] = useFilters(fromUrl);
  const now = useNow(serverNow);
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

  const when = { today: "today", tomorrow: "tomorrow", week: "in the next 7 days" }[filters.day];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <BigDate date={today} today={today} />
        <DateStats
          stats={[
            { value: total, label: `event${total === 1 ? "" : "s"} ${when}` },
            { value: withFood, label: "with free food" },
          ]}
        />
      </div>
      <p className="-mt-2 text-maroon/75">Every public {campus.schoolShortName} event in one place, from club posts.</p>

      <section className="-mx-1 flex flex-col gap-5 rounded-[32px] bg-panel p-3 shadow-sm sm:mx-0 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-semibold lowercase">
            What&apos;s on {filters.day === "week" ? "this week" : DAYS[filters.day].toLowerCase()}
          </h1>
          <Link href="/week" className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-maroon/25 hover:bg-maroon/5">
            Calendar
            <ChevronIcon className="size-4" />
          </Link>
        </div>

        <FilterBar filters={filters} update={update} showWhen />

        <p className="sr-only" aria-live="polite">
          {total} event{total === 1 ? "" : "s"} {when}
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
              <EventCard key={e.id} event={e} now={now} showDate />
            ))}
          </Section>
        )}
      </section>
    </div>
  );
}

function DaySection({ group, today, now, showHeading }: { group: DayGroup; today: string; now: number; showHeading: boolean }) {
  if (!group.fits.length && !group.timeUnknown.length) return null;
  return (
    <section className="flex flex-col gap-3">
      {showHeading && (
        <h2 className="mt-2 px-1 font-display text-base font-semibold">
          {formatDay(group.date, "long", today)}
          {group.date === today && <span className="ml-2 text-maroon/65">Today</span>}
        </h2>
      )}
      {group.fits.map((e) => (
        <EventCard key={e.id} event={e} now={now} />
      ))}
      {group.timeUnknown.length > 0 && (
        <details className="rounded-[28px] bg-canvas px-5 py-3">
          <summary className="cursor-pointer text-sm font-medium text-maroon/85">
            {group.timeUnknown.length} more with no time announced yet
          </summary>
          <div className="mt-3 flex flex-col gap-3 pb-2">
            {group.timeUnknown.map((e) => (
              <EventCard key={e.id} event={e} now={now} />
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
  const button = "mt-4 rounded-full bg-maroon px-4 py-1.5 text-sm font-medium text-cream hover:bg-plum";
  return (
    <div className="rounded-[28px] bg-canvas px-5 py-10 text-center">
      <p className="text-lg font-semibold text-maroon">
        {narrowed ? "Nothing matches" : filters.day === "today" ? "Nothing else on today" : "Nothing announced yet"}
      </p>
      <p className="mt-1 text-sm text-maroon/75">
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
      <h2 className="mt-2 px-1 font-display text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
