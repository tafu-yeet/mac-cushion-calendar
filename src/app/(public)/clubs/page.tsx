import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { MembersOnly } from "@/components/members-only";
import { campus } from "@/lib/campus";
import { getClubs } from "@/lib/clubs";
import { getEventsBetween } from "@/lib/events";
import { getMember } from "@/lib/member";
import { endMs } from "@/lib/status";
import { addDays, dayStartIso, todayInCampus } from "@/lib/time";

import { ClubDirectory, type DirectoryClub } from "./club-directory";

export const metadata: Metadata = {
  title: "Clubs",
  alternates: { canonical: "/clubs" },
  description: `Every ${campus.schoolShortName} club and office we follow, with what each has coming up. Subscribe to a club to get its events in your calendar.`,
};

/** The same window the home page and Communities load, so they share one cached query. */
const WEEKS_AHEAD = 6;

export default function ClubsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] lowercase">clubs</h1>
      <p className="mt-3 text-maroon/75">
        Every club and office we follow. Open one to see what it has coming up, or subscribe to get its events in your calendar.
      </p>
      <Suspense fallback={<div className="mt-6 h-96 skeleton rounded-[32px]" role="status" aria-label="Loading" />}>
        <Directory />
      </Suspense>
    </div>
  );
}

/** Every club, the coming weeks' events, and the time it is now. Reads the clock. */
async function load() {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const [clubs, events] = await Promise.all([getClubs(), getEventsBetween(dayStartIso(today), dayStartIso(addDays(today, WEEKS_AHEAD * 7)))]);
  return { now, clubs, events };
}

async function Directory() {
  const [{ now, clubs, events }, member] = await Promise.all([load(), getMember()]);
  if (!member) {
    return (
      <div className="mt-6">
        <MembersOnly next="/clubs" heading={`${clubs.filter((c) => c.active).length} clubs and offices`} level={2} />
      </div>
    );
  }
  const upcoming = new Map<number, number>();
  for (const e of events) {
    if ((e.startTimeKnown && endMs(e) <= now) || e.scheduleStatus === "cancelled") continue;
    upcoming.set(e.clubId, (upcoming.get(e.clubId) ?? 0) + 1);
  }
  // A to Z by the first letter: "🌍 East African…" goes under E, not before A.
  const sortKey = (name: string) => name.replace(/^[^\p{L}]+/u, "") || name;
  const list: DirectoryClub[] = clubs
    .filter((c) => c.active)
    .map((c) => ({ name: c.name, username: c.username, upcoming: upcoming.get(c.id) ?? 0 }))
    .sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), "en", { sensitivity: "base" }));
  return <ClubDirectory clubs={list} weeks={WEEKS_AHEAD} />;
}
