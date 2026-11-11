import { cacheLife } from "next/cache";
import { connection } from "next/server";

import type { TrackedClub } from "@/lib/filters";
import { createPublicClient } from "@/lib/supabase/public";

/** Every club the worker follows. Its own route so it only loads when a search finds nothing, not with every page. */
async function trackedClubs(): Promise<TrackedClub[]> {
  "use cache";
  cacheLife("hours");
  const { data, error } = await createPublicClient().from("clubs").select("name, instagram_username").eq("active", true).order("name");
  if (error) throw new Error(`Couldn't load the club list: ${error.message}`);
  return data.map((c) => ({ name: c.name ?? c.instagram_username, username: c.instagram_username }));
}

export async function GET() {
  await connection(); // at request time, so a deploy doesn't need the database to be up
  return Response.json(await trackedClubs(), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
