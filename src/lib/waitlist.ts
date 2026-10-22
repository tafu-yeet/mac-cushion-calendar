import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

export const WAITLIST_TAG = "waitlist";

// The page shows how many people joined only once it looks like a crowd.
export const SHOW_COUNT_FROM = 25;

/** How many people are on the waitlist; 0 if it can't be loaded, so the page still works. */
export async function getWaitlistCount(): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag(WAITLIST_TAG);

  const { data, error } = await createPublicClient().rpc("waitlist_count");
  if (error) {
    console.error(`Couldn't count the waitlist: ${error.message}`);
    return 0;
  }
  return data;
}

/** How many club accounts are read, rounded down to a tidy "600+"; null if it can't be loaded. */
export async function getClubCount(): Promise<number | null> {
  "use cache";
  cacheLife("hours");

  const { count, error } = await createPublicClient().from("clubs").select("id", { count: "exact", head: true }).eq("active", true);
  if (error || !count) return null;
  return count >= 100 ? Math.floor(count / 50) * 50 : count;
}
