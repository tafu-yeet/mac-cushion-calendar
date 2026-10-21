// Links that open Google Calendar or Outlook with an event filled in, ready to save.

import type { PublicEvent } from "@/lib/events";
import { calendarDescription, calendarSpan, utc } from "@/lib/ics";

export const CALENDAR_APPS = ["google", "outlook"] as const;
export type CalendarApp = (typeof CALENDAR_APPS)[number];

export function calendarLink(app: CalendarApp, event: PublicEvent, eventUrl: string): string {
  return app === "google" ? googleLink(event, eventUrl) : outlookLink(event, eventUrl);
}

/** A query string with spaces as %20: URLSearchParams writes "+", which not every calendar reads as a space. */
function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString().replace(/\+/g, "%20");
}

/** dates is start/end in UTC (20261007T220000Z), or the day and the day after for all day (20261007/20261008). */
function googleLink(event: PublicEvent, eventUrl: string): string {
  const span = calendarSpan(event);
  const compact = (day: string) => day.replace(/-/g, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = query({
    action: "TEMPLATE",
    text: event.name,
    dates: span.allDay ? `${compact(span.day)}/${compact(span.nextDay)}` : `${utc(span.start)}/${utc(span.end)}`,
    details: calendarDescription(event, eventUrl),
    ...(event.location ? { location: event.location } : {}),
  });
  return url.toString();
}

/** Outlook on the web for Microsoft 365 accounts, which school and work email use. */
function outlookLink(event: PublicEvent, eventUrl: string): string {
  const span = calendarSpan(event);
  const url = new URL("https://outlook.office.com/calendar/0/deeplink/compose");
  url.search = query({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.name,
    startdt: span.allDay ? span.day : span.start.toISOString(),
    enddt: span.allDay ? span.nextDay : span.end.toISOString(),
    allday: String(span.allDay),
    body: calendarDescription(event, eventUrl),
    ...(event.location ? { location: event.location } : {}),
  });
  return url.toString();
}
