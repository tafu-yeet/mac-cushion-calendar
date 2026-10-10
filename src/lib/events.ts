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
  hostedBy: string | null;
  openToAll: boolean;
  clubId: number;
  clubName: string;
  clubUsername: string;
  permalink: string | null;
};

// The admin's review actions call updateTag(EVENTS_TAG), so approvals show up
// on the next request instead of after the cache lifetime.
export const EVENTS_TAG = "events";

const COLUMNS = `id, club_id, name, category, event_type, tags, has_free_food, food_description, cost, price, starts_at, ends_at, start_time_known, location, hosted_by, open_to_all,
  clubs (name, instagram_username), posts (permalink)`;

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
  hosted_by: string | null;
  open_to_all: boolean | null;
  clubs: { name: string; instagram_username: string } | null;
  posts: { permalink: string } | null;
};

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
    hostedBy: r.hosted_by,
    openToAll: r.open_to_all ?? true,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? "A McMaster club",
    clubUsername: r.clubs?.instagram_username ?? "",
    permalink: r.posts?.permalink ?? null,
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
