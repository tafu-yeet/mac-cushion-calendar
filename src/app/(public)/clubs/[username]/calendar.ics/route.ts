import { connection } from "next/server";

import { campus } from "@/lib/campus";
import { CLUB_PAST_DAYS, getClub } from "@/lib/clubs";
import { getClubEvents } from "@/lib/events";
import { feedToIcs } from "@/lib/ics";
import { SITE_URL } from "@/lib/site-url";
import { addDays, dayStartIso, todayInCampus } from "@/lib/time";

// GET /clubs/macmsa/calendar.ics: the club's events as a calendar to subscribe to (webcal://),
// so its new events show up in Google, Outlook or Apple Calendar on their own.
export async function GET(_request: Request, { params }: RouteContext<"/clubs/[username]/calendar.ics">) {
  await connection(); // reads the clock
  const { username } = await params;
  const club = await getClub(username);
  if (!club) return new Response("Club not found", { status: 404 });

  const events = await getClubEvents(club.id, dayStartIso(addDays(todayInCampus(), -CLUB_PAST_DAYS)));
  const body = feedToIcs(
    { name: `${club.name} · ${campus.siteName}`, description: `Events from ${club.name}, from ${SITE_URL}/clubs/${club.username}` },
    events,
    (e) => `${SITE_URL}/events/${e.id}`,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${club.username}.ics"`,
      // Calendar apps poll this; an hour at the edge keeps that off the database.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
