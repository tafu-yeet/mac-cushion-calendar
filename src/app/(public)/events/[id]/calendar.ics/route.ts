import { getEvent } from "@/lib/events";
import { eventToIcs } from "@/lib/ics";

// GET /events/123/calendar.ics: the event as a calendar file.
export async function GET(request: Request, { params }: RouteContext<"/events/[id]/calendar.ics">) {
  const { id } = await params;
  const event = await getEvent(Number(id));
  if (!event) {
    return new Response("Event not found", { status: 404 });
  }
  const eventUrl = new URL(`/events/${event.id}`, request.url).toString();
  const filename = `${event.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "event"}.ics`;
  return new Response(eventToIcs(event, eventUrl), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
