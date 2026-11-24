// Which events go in which member email, and when each email is due. Pure functions of their
// inputs and the clock, so they're tested on their own (src/lib/email/select.test.ts); the job
// in src/lib/email/jobs.ts loads the rows and sends.

import type { PublicEvent } from "@/lib/events";
import { matchesInterests, type Interest } from "@/lib/member-types";
import { addDays, campusDate, minutesIntoDay, toLocalInputs } from "@/lib/time";

/** The Sunday email goes out from 6 PM campus time, for the Monday-to-Sunday week ahead. */
export const DIGEST_FROM_MINUTE = 18 * 60;
export const DIGEST_MAX_PICKS = 8;
export const DIGEST_MAX_FREE_FOOD = 5;
/** No more than this many picks from one club, so one busy club can't fill the email. */
export const DIGEST_MAX_PER_CLUB = 3;

/** A reminder goes out once the event is this close (the job runs every 15 minutes). */
export const REMINDER_LEAD_MINUTES = 60;
export const REMINDER_WINDOW_MINUTES = 75;

/** Club-posts emails go out between these campus times only, at most one a day. */
export const CLUB_POSTS_FROM_MINUTE = 8 * 60;
export const CLUB_POSTS_UNTIL_MINUTE = 21 * 60;
export const CLUB_POSTS_MAX = 10;

const nowIso = (nowMs: number) => new Date(nowMs).toISOString();

/**
 * When it's Sunday from 6 PM to midnight, campus time: the Monday the digest is for (its
 * dedupe key). Otherwise null. A job that misses 6 PM still sends later that evening, never
 * on Monday.
 */
export function digestWeek(nowMs: number): string | null {
  const today = campusDate(nowMs);
  if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 0) return null;
  if (minutesIntoDay(nowIso(nowMs)) < DIGEST_FROM_MINUTE) return null;
  return addDays(today, 1);
}

/** Collapses a weekly program to its first day in the list, so it takes one slot. */
function firstOfEachSeries<E extends PublicEvent>(events: E[]): E[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (!e.weekly) return true;
    const key = `${e.clubId}|${e.name.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const goingAhead = (e: PublicEvent) => e.scheduleStatus !== "cancelled";
const startOrder = (a: PublicEvent, b: PublicEvent) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id;

export type DigestPicks<E extends PublicEvent = PublicEvent> = { picks: E[]; freeFood: E[] };

/**
 * The Sunday email for one member: up to 8 events in the week ahead from the clubs they follow,
 * then ones matching their interests, earliest first within each, at most 3 per club and a
 * weekly program once; then up to 5 free-food highlights not already picked (admins'
 * highlighted ones first). Group-only events count only from followed clubs. `events` must be
 * the week's approved events.
 */
export function selectDigest<E extends PublicEvent>(
  events: E[],
  member: { follows: ReadonlySet<number>; interests: readonly Interest[] },
): DigestPicks<E> {
  const pool = firstOfEachSeries([...events].filter(goingAhead).sort(startOrder));
  const followed = pool.filter((e) => member.follows.has(e.clubId));
  const matching = pool.filter((e) => !member.follows.has(e.clubId) && e.openToAll && matchesInterests(e, member.interests));

  const picks: E[] = [];
  const perClub = new Map<number, number>();
  for (const e of [...followed, ...matching]) {
    if (picks.length >= DIGEST_MAX_PICKS) break;
    const n = perClub.get(e.clubId) ?? 0;
    if (n >= DIGEST_MAX_PER_CLUB) continue;
    perClub.set(e.clubId, n + 1);
    picks.push(e);
  }

  const picked = new Set(picks.map((e) => e.id));
  const freeFood = pool
    .filter((e) => e.hasFreeFood && e.openToAll && !picked.has(e.id))
    .sort((a, b) => Number(b.highlighted) - Number(a.highlighted) || startOrder(a, b))
    .slice(0, DIGEST_MAX_FREE_FOOD)
    .sort(startOrder);
  return { picks, freeFood };
}

/** The member's Sunday email has nothing in it: don't send it. */
export const digestIsEmpty = (d: DigestPicks) => d.picks.length === 0 && d.freeFood.length === 0;

export type Reminder = { userId: string; eventId: number; startsAt: string; startTimeKnown: boolean; cancelled: boolean };

/** Reminders to send now: the event starts within the next 75 minutes, has a time, and is on. */
export function remindersDue<R extends Reminder>(reminders: R[], nowMs: number): R[] {
  return reminders.filter((r) => {
    if (!r.startTimeKnown || r.cancelled) return false;
    const minutes = (Date.parse(r.startsAt) - nowMs) / 60_000;
    return minutes > 0 && minutes <= REMINDER_WINDOW_MINUTES;
  });
}

/** Whether club-posts emails may go out now: daytime, campus time. */
export function clubPostsWindow(nowMs: number): boolean {
  const minute = minutesIntoDay(nowIso(nowMs));
  return minute >= CLUB_POSTS_FROM_MINUTE && minute < CLUB_POSTS_UNTIL_MINUTE;
}

export type NewClubEvent = { id: number; clubId: number; approvedAt: string; startsAt: string; cancelled: boolean };

/**
 * New events from followed clubs for one member's club-posts email: approved after they
 * followed the club and after they turned the email on, still to come, not cancelled, and not
 * in an earlier club-posts email. Earliest first, at most 10.
 */
export function selectClubPosts<E extends NewClubEvent>(
  events: E[],
  member: { followedAt: ReadonlyMap<number, string>; optedInAt: string; alreadySent: ReadonlySet<number> },
  nowMs: number,
): E[] {
  const now = nowIso(nowMs);
  return events
    .filter((e) => {
      const followedAt = member.followedAt.get(e.clubId);
      return (
        followedAt !== undefined &&
        !e.cancelled &&
        e.startsAt > now &&
        e.approvedAt > followedAt &&
        e.approvedAt > member.optedInAt &&
        !member.alreadySent.has(e.id)
      );
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id - b.id)
    .slice(0, CLUB_POSTS_MAX);
}

/** The dedupe key for each kind of email: the same key is never sent to a member twice. */
export const dedupeKey = {
  digest: (monday: string) => `digest:${monday}`,
  clubPosts: (nowMs: number) => `club_posts:${campusDate(nowMs)}`,
  reminder: (eventId: number) => `reminder:${eventId}`,
};

/** "Mon Nov 30" for an event's day in an email. */
export function emailDay(iso: string): string {
  const { date } = toLocalInputs(iso);
  return new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
