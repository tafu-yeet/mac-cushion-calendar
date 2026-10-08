import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { EventCard } from "@/components/event-card";
import { ChevronIcon } from "@/components/icons";
import { campus } from "@/lib/campus";
import { getEventsBetween, type PublicEvent } from "@/lib/events";
import { addDays, dayStartIso, formatDay, toLocalInputs, todayInCampus } from "@/lib/time";

const LOOK_AHEAD_DAYS = 14;
const COMING_UP_COUNT = 6;
// Without an end time, an event counts as "on now" for this long after it starts.
const ASSUMED_LENGTH_MS = 90 * 60 * 1000;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Suspense fallback={<FeedSkeleton />}>
        <TodayFeed />
      </Suspense>
    </div>
  );
}

function isOnNow(e: PublicEvent, now: number): boolean {
  if (!e.startTimeKnown) return false;
  const start = Date.parse(e.startsAt);
  const end = e.endsAt ? Date.parse(e.endsAt) : start + ASSUMED_LENGTH_MS;
  return start <= now && now < end;
}

/** Today's events split by the current time. Reads the clock, so it runs per request. */
async function loadTodayFeed() {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const events = await getEventsBetween(dayStartIso(today), dayStartIso(addDays(today, LOOK_AHEAD_DAYS + 1)));

  const todays = events.filter((e) => toLocalInputs(e.startsAt).date === today);
  return {
    today,
    onNow: todays.filter((e) => isOnNow(e, now)),
    // Events with no announced time stay listed all day.
    laterToday: todays.filter((e) => !isOnNow(e, now) && (!e.startTimeKnown || Date.parse(e.startsAt) > now)),
    comingUp: events.filter((e) => toLocalInputs(e.startsAt).date > today).slice(0, COMING_UP_COUNT),
  };
}

async function TodayFeed() {
  const { today, onNow, laterToday, comingUp } = await loadTodayFeed();
  const quiet = onNow.length === 0 && laterToday.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh minutes={5} />
      <div>
        <p className="text-sm font-medium text-stone-500">{formatDay(today)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">Free food today</h1>
        <p className="mt-1 text-stone-600">Public {campus.schoolShortName} events with free food, from club posts.</p>
      </div>

      {onNow.length > 0 && (
        <Section title="On now">
          {onNow.map((e) => (
            <EventCard key={e.id} event={e} live />
          ))}
        </Section>
      )}

      {laterToday.length > 0 && (
        <Section title="Later today">
          {laterToday.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </Section>
      )}

      {quiet && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-center">
          <p className="text-lg font-semibold text-stone-900">No more free food today</p>
          <p className="mt-1 text-sm text-stone-600">
            {comingUp.length ? "Here's what's coming up next." : "Nothing's been announced for the next two weeks yet. Check back soon."}
          </p>
        </div>
      )}

      {comingUp.length > 0 && (
        <Section title="Coming up">
          {comingUp.map((e) => (
            <EventCard key={e.id} event={e} showDate />
          ))}
        </Section>
      )}

      <Link href="/week" className="inline-flex items-center gap-1 self-start text-sm font-medium text-stone-700 hover:text-stone-900">
        See the whole week
        <ChevronIcon className="size-4" />
      </Link>
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

function FeedSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-label="Loading">
      <div className="h-4 w-40 rounded bg-stone-200" />
      <div className="h-8 w-64 rounded bg-stone-200" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 rounded-2xl bg-stone-200/70" />
      ))}
    </div>
  );
}
