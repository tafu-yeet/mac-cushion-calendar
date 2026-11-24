// Shared by the unit tests: an approved public event with sensible defaults.

import type { PublicEvent } from "@/lib/events";
import { fromLocalInputs } from "@/lib/time";

let nextId = 1;

/** A campus-time instant: at("2026-11-30", "10:00"). */
export const at = (date: string, time: string) => fromLocalInputs(date, time);

export function event(overrides: Partial<PublicEvent> & { date?: string; start?: string; end?: string | null } = {}): PublicEvent {
  const { date = "2026-11-30", start = "12:00", end = "13:00", ...rest } = overrides;
  return {
    id: nextId++,
    name: "An event",
    category: "social",
    eventType: "social",
    tags: [],
    hasFreeFood: false,
    foodDescription: null,
    cost: "unknown",
    price: null,
    startsAt: at(date, start),
    endsAt: end === null ? null : at(date, end),
    startTimeKnown: true,
    location: "MUSC",
    offCampus: false,
    hostedBy: null,
    openToAll: true,
    clubId: 1,
    clubName: "A club",
    clubUsername: "aclub",
    permalink: null,
    addedByHand: false,
    rubricUrl: null,
    scheduleStatus: "scheduled",
    registration: "unknown",
    registrationWhere: null,
    registrationUrl: null,
    checkedAt: null,
    headsUp: null,
    communities: [],
    weekly: null,
    highlighted: false,
    ...rest,
  };
}
