import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, matchesFilters, type Personal } from "@/lib/filters";
import { matchesInterests, rankForMember } from "@/lib/member-types";
import { event } from "@/lib/test-fixtures";

describe("rankForMember (the home feed for signed-in members)", () => {
  const social = event({ category: "social", start: "09:00" });
  const arts = event({ category: "arts", start: "10:00" });
  const pizza = event({ category: "learn", hasFreeFood: true, start: "11:00" });
  const sports = event({ category: "sports", start: "12:00" });
  const artsLater = event({ category: "arts", start: "13:00" });
  const byStart = [social, arts, pizza, sports, artsLater];

  it("puts events in the member's categories first, then the rest, each by start time", () => {
    expect(rankForMember(byStart, ["arts"])).toEqual([arts, artsLater, social, pizza, sports]);
  });

  it("counts free food as an interest", () => {
    expect(rankForMember(byStart, ["free_food"])).toEqual([pizza, social, arts, sports, artsLater]);
    expect(rankForMember(byStart, ["sports", "free_food"])).toEqual([pizza, sports, social, arts, artsLater]);
  });

  it("leaves the order alone with no interests or signed out", () => {
    expect(rankForMember(byStart, [])).toBe(byStart);
    expect(rankForMember(byStart, null)).toBe(byStart);
    expect(rankForMember(byStart, undefined)).toBe(byStart);
  });

  it("matches on category or free food", () => {
    expect(matchesInterests(pizza, ["learn"])).toBe(true);
    expect(matchesInterests(pizza, ["free_food"])).toBe(true);
    expect(matchesInterests(social, ["free_food"])).toBe(false);
    expect(matchesInterests(social, [])).toBe(false);
  });
});

describe("the members' feed filters", () => {
  const followedClub = event({ clubId: 7 });
  const otherClub = event({ clubId: 8 });
  const followedMembersOnly = event({ clubId: 7, openToAll: false });
  const duringClass = event({ clubId: 8, start: "10:00", end: "11:00" });
  const personal: Personal = {
    follows: new Set([7]),
    busy: [{ weekday: 1, start: 600, end: 660, termEndsOn: "2026-12-10" }],
    today: "2026-11-30",
  };

  it("shows only followed clubs, including their members-only events", () => {
    const f = { ...DEFAULT_FILTERS, followed: true };
    expect(matchesFilters(followedClub, f, personal)).toBe(true);
    expect(matchesFilters(otherClub, f, personal)).toBe(false);
    expect(matchesFilters(followedMembersOnly, f, personal)).toBe(true);
  });

  it("hides events that clash with classes when Fits my schedule is on", () => {
    const f = { ...DEFAULT_FILTERS, fits: true };
    expect(matchesFilters(duringClass, f, personal)).toBe(false);
    expect(matchesFilters(otherClub, f, personal)).toBe(true);
  });

  it("ignores expired blocks", () => {
    const f = { ...DEFAULT_FILTERS, fits: true };
    expect(matchesFilters(duringClass, f, { ...personal, today: "2026-12-11" })).toBe(true);
  });

  it("does nothing for someone signed out", () => {
    const f = { ...DEFAULT_FILTERS, followed: true, fits: true };
    expect(matchesFilters(otherClub, f, null)).toBe(true);
    expect(matchesFilters(duringClass, f)).toBe(true);
    // Members-only events stay hidden by default, as before.
    expect(matchesFilters(followedMembersOnly, f)).toBe(false);
  });
});
