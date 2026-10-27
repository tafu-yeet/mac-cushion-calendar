import { NextResponse, type NextRequest } from "next/server";

import { countCalendarAdd } from "@/lib/calendar-adds";
import { getEvent } from "@/lib/events";
import { eventToIcs } from "@/lib/ics";

// GET /events/123/calendar.ics: the event as a calendar file. "inline" lets an iPhone open
// it straight in Calendar; browsers that can't show it still save it under this name.
export async function GET(request: NextRequest, { params }: RouteContext<"/events/[id]/calendar.ics">) {
  const { id } = await params;
  const event = await getEvent(Number(id));
  if (!event) {
    return new Response("Event not found", { status: 404 });
  }
  const eventUrl = new URL(`/events/${event.id}`, request.url).toString();
  const filename = `${event.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "event"}.ics`;
  const response = new NextResponse(eventToIcs(event, eventUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
  countCalendarAdd(request, response, event.id, "ics"); // Apple Calendar and others
  return response;
}
