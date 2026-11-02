"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";

export type SeriesFormState = { error: string } | null;

const CATEGORIES = ["social", "sports", "arts", "learn", "give", "meetings", "other"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const MAX_SKIPPED = 120;

/** "2026-11-11" or "2026-11-09 to 2026-11-13", one per line or comma, as single dates; null if one doesn't parse. */
function skipDates(text: string): string[] | null {
  const out = new Set<string>();
  for (const part of text.split(/[\n,]+/).map((p) => p.trim()).filter(Boolean)) {
    const [from, to = from] = part.split(/\s+to\s+/i).map((d) => d.trim());
    if (!DATE.test(from) || !DATE.test(to) || to < from) return null;
    for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      out.add(d.toISOString().slice(0, 10));
      if (out.size > MAX_SKIPPED) return null;
    }
  }
  return [...out].sort();
}

/** Adds a weekly program, or saves changes to one (`id`), then back to the list. The worker lists its days within 15 minutes. */
export async function saveSeries(_prev: SeriesFormState, formData: FormData): Promise<SeriesFormState> {
  const { supabase } = await requireAdmin();
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const id = Number(text("id")) || null;

  const handle = text("club").replace(/^@/, "").toLowerCase();
  const { data: club } = await supabase.from("clubs").select("id").eq("instagram_username", handle).maybeSingle();
  if (!club) return { error: "Pick the club from the list (its @handle)." };
  const name = text("name");
  if (!name) return { error: "The program needs a name." };
  const days = formData.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Tick at least one day." };
  const startTime = text("start_time");
  const endTime = text("end_time");
  if (!TIME.test(startTime)) return { error: "Add a start time." };
  if (endTime && (!TIME.test(endTime) || endTime <= startTime)) return { error: "The end time should be after the start." };
  const startsOn = text("starts_on");
  const endsOn = text("ends_on");
  if (!DATE.test(startsOn) || !DATE.test(endsOn) || endsOn < startsOn) return { error: "Check the first and last dates." };
  const skipped = skipDates(text("skip_dates"));
  if (!skipped) return { error: "Skipped dates: one per line, like 2026-11-11 or 2026-11-09 to 2026-11-13." };
  const category = text("category");
  if (!CATEGORIES.includes(category)) return { error: "Pick a type." };
  const cost = text("cost");
  if (!["free", "paid", "unknown"].includes(cost)) return { error: "Pick a cost." };
  const sourceUrl = text("source_url") || null;
  if (sourceUrl && !/^https:\/\/\S+$/.test(sourceUrl)) return { error: "The announcement link should start with https://." };
  const hasFreeFood = formData.get("has_free_food") === "on";

  const row = {
    club_id: club.id,
    name,
    category,
    days: [...new Set(days)].sort(),
    start_time: startTime,
    end_time: endTime || null,
    location: text("location") || null,
    has_free_food: hasFreeFood,
    food_description: hasFreeFood ? text("food_description") || null : null,
    cost,
    open_to_all: formData.get("open_to_all") === "on",
    description: text("description") || null,
    source_url: sourceUrl,
    starts_on: startsOn,
    ends_on: endsOn,
    skip_dates: skipped,
  };
  const { error } = id
    ? await supabase.from("event_series").update(row).eq("id", id)
    : await supabase.from("event_series").insert(row);
  if (error) return { error: error.message };
  redirect(`/admin/weekly?saved=${id ? "edited" : "added"}`);
}

/** Stops a program (its upcoming days come off the site at the worker's next run), or starts it again. */
export async function setSeriesActive(id: number, active: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("event_series").update({ active }).eq("id", id);
  refresh();
}
