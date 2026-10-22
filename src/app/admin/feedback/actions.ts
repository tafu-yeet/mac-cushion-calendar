"use server";

import { refresh } from "next/cache";

import { requireAdmin } from "@/lib/auth";

/** Ticks a piece of feedback off as dealt with, or back on. */
export async function setFeedbackDone(id: number, done: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("feedback").update({ done }).eq("id", id);
  refresh();
}
