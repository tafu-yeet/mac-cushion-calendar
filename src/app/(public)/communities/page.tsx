import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { EventCard } from "@/components/event-card";
import { campus } from "@/lib/campus";
import { COMMUNITY_GROUPS, communityOf } from "@/lib/communities";
import { getEventsBetween, type PublicEvent } from "@/lib/events";
import { byStart } from "@/lib/filters";
import { endMs } from "@/lib/status";
import { addDays, dayStartIso, formatDay, toLocalInputs, todayInCampus } from "@/lib/time";

import { MissingEventLink } from "../feedback";

export const metadata: Metadata = {
  title: "Communities",
  description: `${campus.schoolShortName} events for your community: Pride, your faith, your culture, your program, and more.`,
};

const WEEKS_AHEAD = 6;

export default function CommunitiesPage({ searchParams }: PageProps<"/communities">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] lowercase">communities</h1>
      <p className="mt-3 text-maroon/75">
        Events for your community or program. Events only for a group&apos;s members show here too.
      </p>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-[32px] bg-maroon/10" role="status" aria-label="Loading" />}>
        <Browser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The coming weeks' events that haven't ended, and the community picked in the URL. Reads the clock. */
async function load(searchParams: PageProps<"/communities">["searchParams"]) {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const events = await getEventsBetween(dayStartIso(today), dayStartIso(addDays(today, WEEKS_AHEAD * 7)));
  const { c } = await searchParams;
  return {
    now,
    today,
    picked: communityOf(typeof c === "string" ? c : undefined),
    events: events.filter((e) => !(e.startTimeKnown && endMs(e) <= now)).sort(byStart),
  };
}

async function Browser({ searchParams }: { searchParams: PageProps<"/communities">["searchParams"] }) {
  const { now, today, picked, events } = await load(searchParams);
  // Cancelled events stay listed but aren't counted, as elsewhere.
  const count = (key: string) => events.filter((e) => e.communities.includes(key) && e.scheduleStatus !== "cancelled").length;
  const shown = picked ? events.filter((e) => e.communities.includes(picked.key)) : [];

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-[32px] bg-panel p-4 shadow-sm sm:p-6" aria-label="Pick a community">
        {COMMUNITY_GROUPS.map(({ group, communities }) => (
          <div key={group}>
            <h2 className="mb-2 px-1 text-xs font-bold tracking-wider text-maroon/80 uppercase">{group}</h2>
            <div className="flex flex-wrap gap-2">
              {communities.map((c) => {
                const n = count(c.key);
                const active = picked?.key === c.key;
                return (
                  <Link
                    key={c.key}
                    href={active ? "/communities" : `/communities?c=${c.key}`}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                      active
                        ? "bg-maroon text-cream ring-maroon"
                        : n
                          ? "bg-canvas text-maroon ring-maroon/25 hover:bg-butter/70"
                          : "text-maroon/75 ring-maroon/15 hover:bg-canvas"
                    }`}
                  >
                    {c.label}
                    <span className={`text-xs tabular-nums ${active ? "text-cream/80" : "text-maroon/75"}`}>{n}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {picked ? (
        <section className="flex flex-col gap-3" aria-live="polite">
          <h2 className="px-1 font-display text-xl font-semibold lowercase">
            {picked.label}: {shown.length ? `${shown.length} coming up` : "nothing coming up yet"}
          </h2>
          {shown.length === 0 && (
            <p className="rounded-[28px] bg-canvas px-5 py-6 text-center text-sm text-maroon/75">
              Nothing announced for the next {WEEKS_AHEAD} weeks yet. Clubs usually post a few days ahead.
            </p>
          )}
          {groupByDay(shown).map(([date, list]) => (
            <div key={date} className="flex flex-col gap-3">
              <h3 className="mt-2 px-1 font-display text-base font-semibold">
                {formatDay(date, "long", today)}
                {date === today && <span className="ml-2 text-maroon/75">Today</span>}
              </h3>
              {list.map((e) => (
                <EventCard key={e.id} event={e} now={now} />
              ))}
            </div>
          ))}
          <MissingEventLink />
        </section>
      ) : (
        <p className="px-1 text-center text-sm text-maroon/75">Pick a community to see what&apos;s coming up for it.</p>
      )}
    </div>
  );
}

function groupByDay(events: PublicEvent[]): [string, PublicEvent[]][] {
  const days = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const date = toLocalInputs(e.startsAt).date;
    days.set(date, [...(days.get(date) ?? []), e]);
  }
  return [...days.entries()];
}
