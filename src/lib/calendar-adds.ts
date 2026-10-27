import "server-only";

import { after, type NextRequest, type NextResponse } from "next/server";

import { createPublicClient } from "@/lib/supabase/public";

export type CalendarAddApp = "google" | "outlook" | "ics";

// Link previews, crawlers and scripts open links too, but nobody adds an event that way.
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|curl|wget|python|httpclient|headless/i;
const COUNTED_FOR_S = 24 * 60 * 60;

/**
 * Counts one "Add to calendar" for the admin Stats page: once per event per browser a day
 * (a cookie on `response`), so double taps and repeated tests don't inflate it. Call it from
 * the route that answers the add; a failure only loses the count, never the add.
 */
export function countCalendarAdd(request: NextRequest, response: NextResponse, eventId: number, app: CalendarAddApp): void {
  const cookie = `cushion-added-${eventId}`;
  if (request.method !== "GET" || request.cookies.has(cookie) || NOT_A_PERSON.test(request.headers.get("user-agent") ?? "")) {
    return;
  }
  response.cookies.set(cookie, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COUNTED_FOR_S,
  });
  // Counted once the response is on its way.
  after(async () => {
    const { error } = await createPublicClient().from("calendar_adds").insert({ event_id: eventId, app });
    if (error) console.error(`Couldn't count a calendar add: ${error.message}`);
  });
}
