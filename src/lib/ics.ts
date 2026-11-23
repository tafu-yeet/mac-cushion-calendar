// Builds an .ics calendar file (RFC 5545) for one event, for Apple Calendar and
// any other calendar app. Google Calendar and Outlook get links instead
// (calendar-links.ts), so adding an event there doesn't download a file.

import { campus } from "@/lib/campus";
import { freeFoodPhrase } from "@/lib/clean";
import type { PublicEvent } from "@/lib/events";
import { ASSUMED_LENGTH_MINUTES } from "@/lib/status";
import { addDays, toLocalInputs } from "@/lib/time";


/** Escape commas, semicolons, backslashes and newlines in a text value. */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC timestamp in iCalendar form: 20261007T220000Z. Google Calendar links use it too. */
export function utc(instant: Date): string {
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

/** When an event goes in a calendar: its start and end, or, with no start time, all day on its campus-local date. */
export type CalendarSpan = { allDay: false; start: Date; end: Date } | { allDay: true; day: string; nextDay: string };

export function calendarSpan(event: PublicEvent): CalendarSpan {
  if (!event.startTimeKnown) {
    const day = toLocalInputs(event.startsAt).date;
    return { allDay: true, day, nextDay: addDays(day, 1) };
  }
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + ASSUMED_LENGTH_MINUTES * 60_000);
  return { allDay: false, start, end };
}

/** The notes a calendar entry carries: food, price, who's posting it, and links back. */
export function calendarDescription(event: PublicEvent, eventUrl: string): string {
  return [
    event.hasFreeFood && freeFoodPhrase(event.foodDescription),
    event.cost === "paid" && `Entry: ${event.price ?? "paid"}`,
    `Posted by ${event.clubName}${event.hostedBy ? `, hosted by ${event.hostedBy}` : ""}`,
    !event.startTimeKnown && "Start time not announced yet.",
    event.permalink && `Instagram post: ${event.permalink}`,
    event.rubricUrl && `Rubric listing: ${event.rubricUrl}`,
    `More: ${eventUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** One event's VEVENT lines. A subscribed calendar keeps cancelled and postponed events, so they say so. */
function vevent(event: PublicEvent, eventUrl: string, now: Date): string[] {
  const span = calendarSpan(event);
  const when = span.allDay
    ? [`DTSTART;VALUE=DATE:${span.day.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${span.nextDay.replace(/-/g, "")}`]
    : [`DTSTART:${utc(span.start)}`, `DTEND:${utc(span.end)}`];
  const off = event.scheduleStatus === "cancelled" ? "Cancelled: " : event.scheduleStatus === "postponed" ? "Postponed: " : "";
  return [
    "BEGIN:VEVENT",
    `UID:event-${event.id}@mac-cushion-calendar`,
    `DTSTAMP:${utc(now)}`,
    ...when,
    `SUMMARY:${text(off + event.name)}`,
    `DESCRIPTION:${text(calendarDescription(event, eventUrl))}`,
    ...(event.location ? [`LOCATION:${text(event.location)}`] : []),
    `URL:${eventUrl}`,
    ...(event.scheduleStatus === "cancelled" ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT",
  ];
}

function calendarFile(header: string[], body: string[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${campus.siteName}//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...header, ...body, "END:VCALENDAR"];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function eventToIcs(event: PublicEvent, eventUrl: string, now = new Date()): string {
  return calendarFile([], vevent(event, eventUrl, now));
}

/**
 * A calendar to subscribe to (a club's events): calendar apps fetch it again every few
 * hours, so new events show up and changed ones update by their UID.
 */
export function feedToIcs(
  feed: { name: string; description: string },
  events: PublicEvent[],
  urlFor: (event: PublicEvent) => string,
  now = new Date(),
): string {
  const header = [
    `X-WR-CALNAME:${text(feed.name)}`,
    `X-WR-CALDESC:${text(feed.description)}`,
    // How often to check for changes; apps treat it as a hint (Google takes up to a day regardless).
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  return calendarFile(header, events.flatMap((e) => vevent(e, urlFor(e), now)));
}
