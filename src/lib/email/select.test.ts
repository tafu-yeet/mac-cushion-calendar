import { describe, expect, it } from "vitest";

import {
  clubPostsWindow,
  dedupeKey,
  digestIsEmpty,
  digestWeek,
  remindersDue,
  selectClubPosts,
  selectDigest,
  type NewClubEvent,
  type Reminder,
} from "@/lib/email/select";
import { at, event } from "@/lib/test-fixtures";

const ms = (date: string, time: string) => Date.parse(at(date, time));

describe("digestWeek: when the Sunday email is due", () => {
  // 2026-11-29 is a Sunday.
  it("is due from 6 PM Sunday, campus time, for the week starting Monday", () => {
    expect(digestWeek(ms("2026-11-29", "17:59"))).toBeNull();
    expect(digestWeek(ms("2026-11-29", "18:00"))).toBe("2026-11-30");
    expect(digestWeek(ms("2026-11-29", "23:59"))).toBe("2026-11-30");
  });

  it("isn't due on other days, so a missed Sunday never sends on Monday", () => {
    expect(digestWeek(ms("2026-11-30", "00:05"))).toBeNull();
    expect(digestWeek(ms("2026-11-28", "19:00"))).toBeNull();
  });

  it("keys each week's email once per member", () => {
    expect(dedupeKey.digest("2026-11-30")).toBe("digest:2026-11-30");
  });
});

describe("selectDigest", () => {
  const follows = new Set([1]);

  it("puts followed clubs first, then interests, each earliest first", () => {
    const art = event({ clubId: 2, category: "arts", date: "2026-11-30" });
    const followedLater = event({ clubId: 1, date: "2026-12-02" });
    const followedSooner = event({ clubId: 1, date: "2026-12-01" });
    const unrelated = event({ clubId: 3, category: "sports" });
    const { picks } = selectDigest([art, followedLater, followedSooner, unrelated], { follows, interests: ["arts"] });
    expect(picks).toEqual([followedSooner, followedLater, art]);
  });

  it("stops at 8 events and 3 per club", () => {
    const many = Array.from({ length: 6 }, (_, i) => event({ clubId: 1, date: "2026-12-01", start: `1${i}:00`, end: `1${i}:30` }));
    const others = Array.from({ length: 8 }, (_, i) => event({ clubId: 10 + i, category: "arts", date: "2026-12-02" }));
    const { picks } = selectDigest([...many, ...others], { follows, interests: ["arts"] });
    expect(picks).toHaveLength(8);
    expect(picks.filter((e) => e.clubId === 1)).toEqual(many.slice(0, 3));
  });

  it("leaves out cancelled events and lists a weekly program once", () => {
    const cancelled = event({ clubId: 1, scheduleStatus: "cancelled" });
    const weekly = { days: [1, 3], until: "2026-12-10", sourceUrl: null };
    const mon = event({ clubId: 1, name: "Open studio", weekly, date: "2026-11-30" });
    const wed = event({ clubId: 1, name: "Open studio", weekly, date: "2026-12-02" });
    expect(selectDigest([cancelled, mon, wed], { follows, interests: [] }).picks).toEqual([mon]);
  });

  it("includes group-only events from followed clubs, but not from interests", () => {
    const ownClub = event({ clubId: 1, openToAll: false });
    const otherClub = event({ clubId: 2, category: "arts", openToAll: false });
    expect(selectDigest([ownClub, otherClub], { follows, interests: ["arts"] }).picks).toEqual([ownClub]);
  });

  it("adds up to 5 free-food highlights not already picked, highlighted ones first", () => {
    const pickedFood = event({ clubId: 1, hasFreeFood: true, date: "2026-11-30" });
    const food = Array.from({ length: 6 }, (_, i) => event({ clubId: 20 + i, hasFreeFood: true, date: "2026-12-01", start: `1${i}:00`, end: `1${i}:30` }));
    const starred = event({ clubId: 30, hasFreeFood: true, highlighted: true, date: "2026-12-05" });
    const { picks, freeFood } = selectDigest([pickedFood, ...food, starred], { follows, interests: [] });
    expect(picks).toEqual([pickedFood]);
    expect(freeFood).toHaveLength(5);
    expect(freeFood).toContain(starred);
    expect(freeFood).not.toContain(pickedFood);
    // Shown in date order.
    expect(freeFood.map((e) => e.startsAt)).toEqual([...freeFood.map((e) => e.startsAt)].sort());
  });

  it("is empty when nothing matches and there's no free food, so it isn't sent", () => {
    const d = selectDigest([event({ clubId: 9, category: "sports" })], { follows, interests: ["arts"] });
    expect(digestIsEmpty(d)).toBe(true);
  });
});

describe("remindersDue", () => {
  const now = ms("2026-11-30", "10:00");
  const r = (time: string, extra: Partial<Reminder> = {}): Reminder => ({
    userId: "u",
    eventId: 1,
    startsAt: at("2026-11-30", time),
    startTimeKnown: true,
    cancelled: false,
    ...extra,
  });

  it("sends for events starting within the next 75 minutes", () => {
    expect(remindersDue([r("11:00"), r("11:15"), r("11:16"), r("09:59")], now).map((x) => x.startsAt)).toEqual([at("2026-11-30", "11:00"), at("2026-11-30", "11:15")]);
  });

  it("skips cancelled events and ones with no time", () => {
    expect(remindersDue([r("11:00", { cancelled: true }), r("11:00", { startTimeKnown: false })], now)).toEqual([]);
  });
});

describe("selectClubPosts", () => {
  const now = ms("2026-11-30", "12:00");
  const followedAt = new Map([[1, at("2026-11-20", "12:00")]]);
  const e = (id: number, extra: Partial<NewClubEvent> = {}): NewClubEvent => ({
    id,
    clubId: 1,
    approvedAt: at("2026-11-29", "12:00"),
    startsAt: at("2026-12-03", "18:00"),
    cancelled: false,
    ...extra,
  });

  it("sends new events from followed clubs that weren't in an earlier email", () => {
    const picked = selectClubPosts([e(1), e(2), e(3, { clubId: 2 })], { followedAt, optedInAt: at("2026-11-21", "00:00"), alreadySent: new Set([2]) }, now);
    expect(picked.map((x) => x.id)).toEqual([1]);
  });

  it("skips events approved before the follow or before opting in, past and cancelled ones", () => {
    const events = [
      e(1, { approvedAt: at("2026-11-19", "12:00") }),
      e(2, { approvedAt: at("2026-11-22", "12:00") }),
      e(3, { startsAt: at("2026-11-30", "11:00") }),
      e(4, { cancelled: true }),
    ];
    expect(selectClubPosts(events, { followedAt, optedInAt: at("2026-11-23", "00:00"), alreadySent: new Set() }, now)).toEqual([]);
  });

  it("goes out in the daytime only, once a day", () => {
    expect(clubPostsWindow(ms("2026-11-30", "07:59"))).toBe(false);
    expect(clubPostsWindow(ms("2026-11-30", "08:00"))).toBe(true);
    expect(clubPostsWindow(ms("2026-11-30", "21:00"))).toBe(false);
    expect(dedupeKey.clubPosts(ms("2026-11-30", "08:00"))).toBe(dedupeKey.clubPosts(ms("2026-11-30", "20:59")));
  });
});
