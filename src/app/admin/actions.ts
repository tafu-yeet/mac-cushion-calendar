"use server";

import { refresh, updateTag } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { isCategory } from "@/lib/categories";
import { EVENTS_TAG } from "@/lib/events";
import { fromLocalInputs } from "@/lib/time";

type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
export type ReviewState = { error: string } | null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One action for every button on an event card; the clicked button's
 * `intent` says what to do: approve, save, reject, pending (back to the
 * queue), approve_group (approve this one and reject its duplicates), or
 * clear_flags (save, and dismiss its flags so the worker doesn't raise them again).
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
  } else if (intent.startsWith("use_rubric:") || intent.startsWith("keep_instagram:")) {
    const result = await settleConflict(supabase, id, intent);
    if (result) return result;
  } else if (intent === "approve" || intent === "save" || intent === "approve_group" || intent === "clear_flags") {
    const parsed = parseEventFields(formData);
    if ("error" in parsed) return parsed;
    // Fields the person changed are theirs from now on: merging with Rubric won't overwrite them.
    const { data: current, error: readError } = await supabase.from("events").select(EDITABLE.join(", ") + ", reviewed_fields, flags").eq("id", id).single();
    if (readError) return { error: readError.message };
    const changed = changedFields(current as unknown as Record<string, unknown>, parsed);
    const { reviewed_fields: before, flags } = current as unknown as { reviewed_fields: string[] | null; flags: string[] | null };
    // Dismissed flags are remembered as "flag:<name>", so the worker won't raise them again for this event.
    const dismissed = intent === "clear_flags" ? (flags ?? []).map((f) => `flag:${f}`) : [];
    const reviewedFields = [...new Set([...(before ?? []), ...changed, ...dismissed])];
    const update: EventUpdate = {
      ...parsed,
      reviewed_fields: reviewedFields,
      ...(intent === "clear_flags" ? { flags: [] } : {}),
      ...(intent === "save" || intent === "clear_flags" ? {} : { status: "approved", auto_approved: false, ...reviewed }),
    };
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

  updateTag(EVENTS_TAG); // the public pages show the change on their next request
  refresh();
  return null;
}

// The fields the review form edits, as stored.
const EDITABLE = [
  "name", "starts_at", "start_time_known", "ends_at", "location", "hosted_by", "has_free_food", "food_description",
  "open_to_all", "event_type", "category", "cost", "price", "tags", "schedule_status", "registration", "registration_where",
  "registration_url",
] as const;

/** Which fields the form changed; a start time made known counts as a change to the start. */
function changedFields(current: Record<string, unknown>, next: EventUpdate): string[] {
  const same = (a: unknown, b: unknown) => {
    if (typeof a === "string" && typeof b === "string" && !Number.isNaN(Date.parse(a)) && /T\d/.test(a)) {
      return Date.parse(a) === Date.parse(b);
    }
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  };
  const changed = EDITABLE.filter((f) => f in next && !same(current[f], (next as Record<string, unknown>)[f])).map(String);
  return changed.includes("start_time_known") ? [...changed.filter((f) => f !== "start_time_known"), "starts_at"] : changed;
}

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
type StoredConflict = { rubric: string | boolean | null; instagram: string | boolean | null; why?: string };

/**
 * Settles one Rubric/Instagram disagreement (worker/merge.py): saves the chosen
 * value, and marks the field as decided by a person so merging leaves it alone.
 */
async function settleConflict(supabase: Supabase, id: number, intent: string): Promise<ReviewState> {
  const [choice, field] = intent.split(":");
  const { data: event, error } = await supabase.from("events").select("conflicts, reviewed_fields, flags").eq("id", id).single();
  if (error) return { error: error.message };
  const conflicts = { ...((event.conflicts ?? {}) as Record<string, StoredConflict>) };
  const conflict = conflicts[field];
  if (!conflict) return { error: "That disagreement was already settled." };
  delete conflicts[field];
  const value = choice === "use_rubric" ? conflict.rubric : conflict.instagram;

  const update: EventUpdate = {
    conflicts,
    reviewed_fields: [...new Set([...(event.reviewed_fields ?? []), field])],
    // With nothing left to settle, the "changed on Instagram" warning has been dealt with.
    ...(Object.keys(conflicts).length ? {} : { flags: (event.flags ?? []).filter((f) => f !== "changed_on_instagram") }),
  };
  if (field === "starts_at" && typeof value === "string") Object.assign(update, { starts_at: value, start_time_known: true });
  else if (field === "ends_at") update.ends_at = typeof value === "string" ? value : null;
  else if (field === "location") update.location = typeof value === "string" ? value : null;
  else if (field === "price") update.price = typeof value === "string" ? value : null;
  else if (field === "cost" && (value === "free" || value === "paid" || value === "unknown")) {
    Object.assign(update, { cost: value, ...(value === "free" ? { price: null } : {}) });
  } else if (field === "has_free_food" && typeof value === "boolean") update.has_free_food = value;
  else return { error: `Can't settle "${field}" here; edit the field instead.` };

  const { error: saveError } = await supabase.from("events").update(update).eq("id", id);
  return saveError ? { error: saveError.message } : null;
}

/** A person's answer to "is this Rubric event the same as this Instagram event?" (worker/merge.py acts on it). */
export async function decideMatch(formData: FormData): Promise<void> {
  const { supabase, userId } = await requireAdmin();
  const rubricEid = Number(formData.get("rubric_eid"));
  const eventId = Number(formData.get("event_id"));
  const decision = formData.get("decision");
  if (!Number.isInteger(rubricEid) || !Number.isInteger(eventId) || (decision !== "same" && decision !== "different")) return;
  await supabase
    .from("event_matches")
    .update({ status: decision === "same" ? "merged" : "separate", decided_by: userId, decided_at: new Date().toISOString() })
    .eq("rubric_eid", rubricEid)
    .eq("event_id", eventId);
  refresh();
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

  const category = text("category");
  if (!isCategory(category)) return { error: "Pick a category." };
  const cost = text("cost");
  if (cost !== "free" && cost !== "paid" && cost !== "unknown") return { error: "Pick a cost." };

  const scheduleStatus = text("schedule_status") || "scheduled";
  if (!SCHEDULE.includes(scheduleStatus)) return { error: "Pick whether it's still on." };
  const registration = text("registration") || "unknown";
  if (!REGISTRATION.includes(registration)) return { error: "Pick a registration." };
  const asks = registration === "required" || registration === "recommended";
  const where = asks ? text("registration_where") || null : null;
  if (where && !WHERE.includes(where)) return { error: "Pick where to register." };
  const registrationUrl = asks ? text("registration_url") || null : null;
  if (registrationUrl && (!/^https?:\/\//.test(registrationUrl) || registrationUrl.length > 500)) {
    return { error: "The registration link should start with https://." };
  }

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
    hosted_by: text("hosted_by") || null,
    has_free_food: checked("has_free_food"),
    food_description: text("food_description") || null,
    open_to_all: checked("open_to_all"),
    event_type: text("event_type").toLowerCase() || "other",
    category,
    cost,
    price: cost === "paid" ? text("price") || null : null,
    tags: text("tags")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    schedule_status: scheduleStatus,
    registration,
    registration_where: where,
    registration_url: registrationUrl,
  };
}

const SCHEDULE = ["scheduled", "cancelled", "postponed"];
const REGISTRATION = ["required", "recommended", "drop_in", "unknown"];
const WHERE = ["rubric", "link_in_bio", "form", "qr_code", "at_the_door", "other"];
