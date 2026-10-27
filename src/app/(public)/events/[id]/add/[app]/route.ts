import { NextResponse, type NextRequest } from "next/server";

import { countCalendarAdd } from "@/lib/calendar-adds";
import { CALENDAR_APPS, calendarLink, type CalendarApp } from "@/lib/calendar-links";
import { getEvent } from "@/lib/events";

// GET /events/123/add/google (or /outlook): sends you to that calendar with the event filled in.
export async function GET(request: NextRequest, { params }: RouteContext<"/events/[id]/add/[app]">) {
  const { id, app } = await params;
  if (!CALENDAR_APPS.includes(app as CalendarApp)) {
    return new Response("Unknown calendar", { status: 404 });
  }
  const event = await getEvent(Number(id));
  if (!event) {
    return new Response("Event not found", { status: 404 });
  }
  const eventUrl = new URL(`/events/${event.id}`, request.url).toString();
  const response = NextResponse.redirect(calendarLink(app as CalendarApp, event, eventUrl), 302);
  countCalendarAdd(request, response, event.id, app as CalendarApp);
  return response;
}
