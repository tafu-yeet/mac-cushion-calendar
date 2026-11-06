import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { getEventsBetween } from "@/lib/events";
import { SITE_URL } from "@/lib/site-url";
import { endMs } from "@/lib/status";
import { addDays, dayStartIso, todayInCampus } from "@/lib/time";

// "Upcoming" has no end, but the query needs one.
const DAYS_AHEAD = 3650;

/** The main pages and every event that hasn't ended, the same events the site lists. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // per request: built once at deploy, it would only ever list that day's events
  const now = Date.now();
  const today = todayInCampus();
  const events = await getEventsBetween(dayStartIso(today), dayStartIso(addDays(today, DAYS_AHEAD)));
  const upcoming = events.filter((e) => !(e.startTimeKnown && endMs(e) <= now));

  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/week` },
    { url: `${SITE_URL}/communities` },
    ...upcoming.map((e) => ({ url: `${SITE_URL}/events/${e.id}` })),
  ];
}
