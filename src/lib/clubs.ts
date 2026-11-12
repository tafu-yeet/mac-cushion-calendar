import "server-only";

import { cacheLife } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

/** A club (or office) the worker follows, as its public page shows it. */
export type Club = {
  id: number;
  name: string;
  username: string; // Instagram handle, lowercase: the page is /clubs/[username]
  communities: string[]; // campus.config.json "communities" (worker/communities.py)
  active: boolean; // still followed; paused clubs keep their page so old event links work
};

/** Every club, A to Z. One small cached list (about 660 rows) serves the directory and every club page. */
export async function getClubs(): Promise<Club[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await createPublicClient().from("clubs").select("id, name, instagram_username, communities, active").order("name");
  if (error) throw new Error(`Couldn't load the club list: ${error.message}`);
  return data.map((c) => ({
    id: c.id,
    name: c.name || c.instagram_username,
    username: c.instagram_username,
    communities: c.communities ?? [],
    active: c.active,
  }));
}

/** The club with this Instagram handle, or null. */
export async function getClub(username: string): Promise<Club | null> {
  const handle = decodeURIComponent(username).toLowerCase();
  return (await getClubs()).find((c) => c.username === handle) ?? null;
}

/**
 * How far back a club's page and calendar feed reach: the page counts recent events (is the
 * club active?), and the feed keeps events that just happened in people's calendars.
 */
export const CLUB_PAST_DAYS = 30;
