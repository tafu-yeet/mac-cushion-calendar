// Builds an .ics calendar file (RFC 5545) for one event, so "Add to calendar"
// works with Google Calendar, Apple Calendar, and Outlook.

import { campus } from "@/lib/campus";
import type { PublicEvent } from "@/lib/events";
import { addDays, toLocalInputs } from "@/lib/time";

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/** Escape commas, semicolons, backslashes and newlines in a text value. */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC timestamp in iCalendar form: 20261007T220000Z. */
function utc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 bytes are folded onto continuation lines that start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (bytes.encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function eventToIcs(event: PublicEvent, eventUrl: string, now = new Date()): string {
  const start = new Date(event.startsAt);
  const when: string[] = [];
  if (event.startTimeKnown) {
    const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
    when.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`);
  } else {
    // No start time: an all-day event on its campus-local date.
    const day = toLocalInputs(event.startsAt).date;
    when.push(`DTSTART;VALUE=DATE:${day.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, "")}`);
  }

  const description = [
    event.hasFreeFood && `Free food: ${event.foodDescription ?? "yes"}`,
    event.cost === "paid" && `Entry: ${event.price ?? "paid"}`,
    `Posted by ${event.clubName}${event.hostedBy ? `, hosted by ${event.hostedBy}` : ""}`,
    !event.startTimeKnown && "Start time not announced yet.",
    event.permalink && `Instagram post: ${event.permalink}`,
    `More: ${eventUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${campus.siteName}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${event.id}@mac-cushion-calendar`,
    `DTSTAMP:${utc(now)}`,
    ...when,
    `SUMMARY:${text(event.name)}`,
    `DESCRIPTION:${text(description)}`,
    ...(event.location ? [`LOCATION:${text(event.location)}`] : []),
    `URL:${eventUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
