import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import type { Category } from "@/lib/categories";
import { cleanFood, cleanPlace } from "@/lib/clean";
import { similarNames } from "@/lib/duplicates";
import { createPublicClient } from "@/lib/supabase/public";

/** An approved event as the public site shows it. */
export type PublicEvent = {
  id: number;
  name: string;
  category: Category;
  eventType: string;
  tags: string[];
  hasFreeFood: boolean;
  foodDescription: string | null;
  cost: "free" | "paid" | "unknown";
  price: string | null;
  startsAt: string; // UTC ISO; public events always have a date
  endsAt: string | null;
  startTimeKnown: boolean;
  location: string | null;
  offCampus: boolean; // away from campus: listed in its own section
  hostedBy: string | null;
  openToAll: boolean;
  clubId: number;
  clubName: string;
  clubUsername: string;
  permalink: string | null; // the Instagram post; null when there's none, or it was deleted
  rubricUrl: string | null; // the event's listing on Rubric, the MSU's club platform (tickets, sign-up)
  // Still on? Cancelled and postponed events stay listed, marked, until their date has passed.
  scheduleStatus: "scheduled" | "cancelled" | "postponed";
  // From the caption first, then Rubric (worker/registration.py); unknown shows nothing.
  registration: "required" | "recommended" | "drop_in" | "unknown";
  registrationWhere: "rubric" | "link_in_bio" | "form" | "qr_code" | "at_the_door" | "other" | null;
  registrationUrl: string | null;
  checkedAt: string | null; // when its post or Rubric listing was last seen still there
  // Why it may be off or changed, while the worker's flag waits for a person (null when nothing's in doubt).
  headsUp: string | null;
};

// The admin's review actions call updateTag(EVENTS_TAG), so approvals show up
// on the next request instead of after the cache lifetime.
export const EVENTS_TAG = "events";

const COLUMNS = `id, club_id, name, category, event_type, tags, has_free_food, food_description, cost, price, starts_at, ends_at, start_time_known, location, off_campus, hosted_by, open_to_all,
  ticket_url, schedule_status, registration, registration_where, registration_url, checked_at, flags,
  clubs (name, instagram_username), posts (permalink, deleted_at)`;

type Row = {
  id: number;
  club_id: number;
  name: string;
  category: string;
  event_type: string;
  tags: string[];
  has_free_food: boolean;
  food_description: string | null;
  cost: string;
  price: string | null;
  starts_at: string | null;
  ends_at: string | null;
  start_time_known: boolean;
  location: string | null;
  off_campus: boolean;
  hosted_by: string | null;
  open_to_all: boolean | null;
  ticket_url: string | null;
  schedule_status: string;
  registration: string;
  registration_where: string | null;
  registration_url: string | null;
  checked_at: string | null;
  flags: string[];
  clubs: { name: string; instagram_username: string } | null;
  posts: { permalink: string; deleted_at: string | null } | null;
};

/**
 * What visitors should know when the worker has doubts about an event that a person
 * hasn't settled yet (worker/recheck.py, merge.py, visitors' reports). Clearing the
 * flags in the admin, or marking the event cancelled or postponed, replaces it.
 */
function headsUp(flags: string[] | null): string | null {
  const f = new Set(flags ?? []);
  if (f.has("instagram_post_deleted")) return "The club deleted its post about this event, so it may be cancelled or changed.";
  if (f.has("possibly_cancelled") || f.has("rubric_cancelled")) return "The club posted about a cancellation or change that may affect this event.";
  if (f.has("reported_cancelled")) return "Visitors told us this event may be cancelled.";
  if (f.has("caption_changed")) return "The club edited its post since we read it, so details may have changed.";
  return null;
}

function toPublicEvent(r: Row): PublicEvent {
  return {
    id: r.id,
    name: r.name,
    category: r.category as Category,
    eventType: r.event_type,
    tags: r.tags,
    hasFreeFood: r.has_free_food,
    foodDescription: r.has_free_food ? cleanFood(r.food_description) : null,
    cost: r.cost as PublicEvent["cost"],
    price: r.price,
    startsAt: r.starts_at!,
    endsAt: r.ends_at,
    startTimeKnown: r.start_time_known,
    location: cleanPlace(r.location),
    offCampus: r.off_campus,
    hostedBy: r.hosted_by,
    openToAll: r.open_to_all ?? true,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? "A McMaster club",
    clubUsername: r.clubs?.instagram_username ?? "",
    // A deleted post would be a dead link; the event itself still stands.
    permalink: r.posts && !r.posts.deleted_at ? r.posts.permalink : null,
    rubricUrl: r.ticket_url,
    scheduleStatus: r.schedule_status as PublicEvent["scheduleStatus"],
    registration: r.registration as PublicEvent["registration"],
    registrationWhere: r.registration_where as PublicEvent["registrationWhere"],
    registrationUrl: r.registration_url,
    checkedAt: r.checked_at,
    headsUp: r.schedule_status === "scheduled" ? headsUp(r.flags) : null,
  };
}

// How complete a listing is, to pick which of several copies to keep.
const detail = (e: PublicEvent) =>
  Number(e.startTimeKnown) + Number(!!e.endsAt) * 2 + Number(!!e.location) + Number(!!e.foodDescription) + Number(!!e.price);

/**
 * One listing per event: a club that posts the same event twice (a flyer,
 * then a reminder) gets copies with the same start and near-identical
 * names. Keeps the most complete copy.
 */
function collapseCopies(events: PublicEvent[]): PublicEvent[] {
  const kept: PublicEvent[] = [];
  for (const e of events) {
    const i = kept.findIndex((k) => k.clubId === e.clubId && k.startsAt === e.startsAt && similarNames(k.name, e.name));
    if (i === -1) kept.push(e);
    else if (detail(e) > detail(kept[i]) || (detail(e) === detail(kept[i]) && e.id < kept[i].id)) kept[i] = e;
  }
  return kept;
}

/** Approved events starting in [fromIso, toIso), earliest first, one listing per event. */
export async function getEventsBetween(fromIso: string, toIso: string): Promise<PublicEvent[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(EVENTS_TAG);

  const { data, error } = await createPublicClient()
    .from("events")
    .select(COLUMNS)
    .eq("status", "approved")
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at");
  if (error) throw new Error(`Couldn't load events: ${error.message}`);
  return collapseCopies((data as Row[]).map(toPublicEvent));
}

/** One approved event, or null if it doesn't exist or isn't public. */
export async function getEvent(id: number): Promise<PublicEvent | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(EVENTS_TAG);

  if (!Number.isInteger(id) || id <= 0) return null;
  const { data, error } = await createPublicClient()
    .from("events")
    .select(COLUMNS)
    .eq("id", id)
    .eq("status", "approved")
    .not("starts_at", "is", null)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load event ${id}: ${error.message}`);
  return data ? toPublicEvent(data as Row) : null;
}
