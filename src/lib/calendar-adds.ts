import "server-only";

import { createPublicClient } from "@/lib/supabase/public";

export type CalendarAddApp = "google" | "outlook" | "ics";

/** Counts one "Add to calendar" (admin Stats page). A failure only loses the count, never the add. */
export async function recordCalendarAdd(eventId: number, app: CalendarAddApp): Promise<void> {
  const { error } = await createPublicClient().from("calendar_adds").insert({ event_id: eventId, app });
  if (error) console.error(`Couldn't count a calendar add: ${error.message}`);
}
