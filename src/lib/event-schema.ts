// An event as schema.org data for search engines. It says only what the event page
// says: no end time or place the club hasn't given. Empty fields are left undefined,
// which JSON.stringify drops.

import { campus } from "@/lib/campus";
import type { PublicEvent } from "@/lib/events";
import { toLocalInputs, toOffsetIso } from "@/lib/time";

/** A place that's a call or a stream, not a room. */
export const ONLINE = /\b(online|virtual|zoom|teams|discord|webinar|livestream)\b/i;

const EVENT_STATUS = {
  scheduled: "https://schema.org/EventScheduled",
  cancelled: "https://schema.org/EventCancelled",
  postponed: "https://schema.org/EventPostponed",
} as const;

function locationOf(e: PublicEvent) {
  if (!e.location) return undefined;
  if (ONLINE.test(e.location)) return { "@type": "VirtualLocation", name: e.location, url: e.registrationUrl ?? e.permalink ?? undefined };
  // On campus the room is the name and the campus is the address. Off campus, what the club wrote is all we have.
  return { "@type": "Place", name: e.location, address: e.offCampus ? e.location : { "@type": "PostalAddress", ...campus.address } };
}

export function eventSchema(e: PublicEvent) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.name,
    // With no time announced, a date alone: the stored midnight isn't when it starts.
    // Campus time, not UTC: in UTC an 8 PM end falls on the next day, and reads as a two-day event.
    startDate: e.startTimeKnown ? toOffsetIso(e.startsAt) : toLocalInputs(e.startsAt).date,
    endDate: e.startTimeKnown && e.endsAt ? toOffsetIso(e.endsAt) : undefined,
    // Without this, a cancelled event would read as still on.
    eventStatus: EVENT_STATUS[e.scheduleStatus],
    eventAttendanceMode: e.location && ONLINE.test(e.location) ? "https://schema.org/OnlineEventAttendanceMode" : undefined,
    location: locationOf(e),
    organizer: {
      "@type": "Organization",
      name: e.hostedBy ?? e.clubName,
      // The Instagram profile belongs to the club that posted, which may not be the host.
      url: !e.hostedBy && e.clubUsername ? `https://www.instagram.com/${e.clubUsername}/` : undefined,
    },
    isAccessibleForFree: e.cost === "free" ? true : undefined,
  };
}

/** The schema as a script tag's text. Names come from club posts, so a "<" can't be allowed to end the tag. */
export function eventSchemaJson(e: PublicEvent): string {
  return JSON.stringify(eventSchema(e)).replace(/</g, "\\u003c");
}
