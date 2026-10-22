"use server";

import { refresh, updateTag } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { WAITLIST_TAG } from "@/lib/waitlist";

/** Takes someone off the waitlist, e.g. when they ask to be removed. */
export async function removeFromWaitlist(id: number) {
  const { supabase } = await requireAdmin();
  await supabase.from("waitlist").delete().eq("id", id);
  updateTag(WAITLIST_TAG); // the count on the sign-up page
  refresh();
}
