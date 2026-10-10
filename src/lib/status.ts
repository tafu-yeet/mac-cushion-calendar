// Whether an event is on now, about to start, or later, from the current time.
// Instants are UTC, so this holds in any timezone; times are shown in campus time.

import type { PublicEvent } from "@/lib/events";

/** An event with no end time is assumed to run this long, everywhere on the site. */
export const ASSUMED_LENGTH_MINUTES = 120;
// "Starts in N min" shows from this long before the start.
const SOON_MINUTES = 60;

export type EventStatus =
  | { kind: "live" }
  | { kind: "soon"; minutes: number }
  | { kind: "later" }
  | { kind: "ended" }
  | { kind: "untimed" }; // no start time announced

type Timing = Pick<PublicEvent, "startsAt" | "endsAt" | "startTimeKnown">;

export function endMs(e: Timing): number {
  return e.endsAt ? Date.parse(e.endsAt) : Date.parse(e.startsAt) + ASSUMED_LENGTH_MINUTES * 60_000;
}

export function eventStatus(e: Timing, now: number): EventStatus {
  if (!e.startTimeKnown) return { kind: "untimed" };
  const start = Date.parse(e.startsAt);
  if (now >= endMs(e)) return { kind: "ended" };
  if (now >= start) return { kind: "live" };
  const minutes = Math.ceil((start - now) / 60_000);
  return minutes <= SOON_MINUTES ? { kind: "soon", minutes } : { kind: "later" };
}

/** "Starts in 25 min", "Starts in 1 h". */
export function startsInLabel(minutes: number): string {
  return minutes >= 60 ? "Starts in 1 h" : `Starts in ${minutes} min`;
}
