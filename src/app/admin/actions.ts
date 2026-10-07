"use server";

import { refresh } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { fromLocalInputs } from "@/lib/time";

type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
export type ReviewState = { error: string } | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One action for every button on an event card; the clicked button's
 * `intent` says what to do: approve, save, reject, pending (back to the
 * queue), or approve_group (approve this one and reject its duplicates).
 */
export async function reviewEvent(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const { supabase, userId } = await requireAdmin();
  const id = Number(formData.get("id"));
  const intent = String(formData.get("intent") ?? "");
  if (!Number.isInteger(id)) return { error: "Missing event id." };
  const reviewed = { reviewed_at: new Date().toISOString(), reviewed_by: userId };

  if (intent === "reject" || intent === "pending") {
    const status = intent === "reject" ? "rejected" : "pending";
    const { error } = await supabase.from("events").update({ status, ...reviewed }).eq("id", id);
    if (error) return { error: error.message };
  } else if (intent === "approve" || intent === "save" || intent === "approve_group") {
    const parsed = parseEventFields(formData);
    if ("error" in parsed) return parsed;
    const update: EventUpdate = intent === "save" ? parsed : { ...parsed, status: "approved", ...reviewed };
    const { error } = await supabase.from("events").update(update).eq("id", id);
    if (error) return { error: error.message };

    if (intent === "approve_group") {
      const siblings = String(formData.get("sibling_ids") ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0 && n !== id);
      if (siblings.length) {
        const { error: groupError } = await supabase
          .from("events")
          .update({ status: "rejected", ...reviewed })
          .in("id", siblings)
          .eq("status", "pending");
        if (groupError) return { error: `Approved, but rejecting the duplicates failed: ${groupError.message}` };
      }
    }
  } else {
    return { error: `Unknown action "${intent}".` };
  }

  refresh();
  return null;
}

function parseEventFields(formData: FormData): EventUpdate | { error: string } {
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const checked = (key: string) => formData.get(key) === "on";

  const name = text("name");
  if (!name) return { error: "The event needs a name." };

  const date = text("start_date");
  const timeUnknown = checked("time_unknown");
  const time = text("start_time");
  const endTime = text("end_time");
  if (date && !DATE.test(date)) return { error: "The date doesn't look right." };
  if (date && !timeUnknown && !TIME.test(time)) return { error: "Add a start time, or tick “Time unknown”." };
  if (endTime && !TIME.test(endTime)) return { error: "The end time doesn't look right." };

  const startsAt = date ? fromLocalInputs(date, timeUnknown ? "00:00" : time) : null;
  let endsAt: string | null = null;
  if (date && endTime) {
    endsAt = fromLocalInputs(date, endTime);
    // An end time earlier than the start means the event runs past midnight.
    if (startsAt && !timeUnknown && endsAt <= startsAt) {
      endsAt = new Date(new Date(endsAt).getTime() + DAY_MS).toISOString();
    }
  }

  return {
    name,
    starts_at: startsAt,
    start_time_known: !timeUnknown,
    ends_at: endsAt,
    location: text("location") || null,
    has_free_food: checked("has_free_food"),
    food_description: text("food_description") || null,
    open_to_all: checked("open_to_all"),
    event_type: text("event_type").toLowerCase() || "other",
    tags: text("tags")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  };
}
