import { describe, expect, it } from "vitest";

import {
  activeBlocks,
  blocksFromCells,
  cellKey,
  cellsFromBlocks,
  clashesWithSchedule,
  currentTerm,
  isValidBlock,
  isoWeekday,
  mergeBlocks,
  scheduleExpired,
  type BusyBlock,
} from "@/lib/schedule";
import { at, event } from "@/lib/test-fixtures";

// 2026-11-30 is a Monday; Fall 2026 classes end 2026-12-10.
const TERM_END = "2026-12-10";
const mondayClass: BusyBlock = { weekday: 1, start: 10 * 60, end: 11 * 60, termEndsOn: TERM_END };

describe("isoWeekday", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    expect(isoWeekday("2026-11-30")).toBe(1);
    expect(isoWeekday("2026-12-06")).toBe(7);
  });
});

describe("clashesWithSchedule", () => {
  it("hides an event that overlaps a class", () => {
    expect(clashesWithSchedule(event({ start: "10:30", end: "11:30" }), [mondayClass])).toBe(true);
  });

  it("keeps an event on another weekday", () => {
    expect(clashesWithSchedule(event({ date: "2026-12-01", start: "10:00", end: "11:00" }), [mondayClass])).toBe(false);
  });

  describe("the 15-minute buffer", () => {
    it("hides an event starting less than 15 minutes after class", () => {
      expect(clashesWithSchedule(event({ start: "11:10", end: "12:00" }), [mondayClass])).toBe(true);
    });
    it("keeps an event starting exactly 15 minutes after class", () => {
      expect(clashesWithSchedule(event({ start: "11:15", end: "12:00" }), [mondayClass])).toBe(false);
    });
    it("hides an event ending less than 15 minutes before class", () => {
      expect(clashesWithSchedule(event({ start: "09:00", end: "09:50" }), [mondayClass])).toBe(true);
    });
    it("keeps an event ending exactly 15 minutes before class", () => {
      expect(clashesWithSchedule(event({ start: "08:00", end: "09:45" }), [mondayClass])).toBe(false);
    });
    it("can be set to zero", () => {
      expect(clashesWithSchedule(event({ start: "11:00", end: "12:00" }), [mondayClass], 0)).toBe(false);
    });
  });

  it("assumes a two-hour event when there's no end time", () => {
    // 8:00 to an assumed 10:00, plus the buffer, runs into the 10:00 class.
    expect(clashesWithSchedule(event({ start: "08:00", end: null }), [mondayClass])).toBe(true);
    expect(clashesWithSchedule(event({ start: "07:30", end: null }), [mondayClass])).toBe(false);
  });

  it("never hides an event with no announced time", () => {
    expect(clashesWithSchedule(event({ start: "10:00", end: "11:00", startTimeKnown: false }), [mondayClass])).toBe(false);
  });

  it("stops applying a block after its term ends", () => {
    expect(clashesWithSchedule(event({ date: "2026-12-07", start: "10:00", end: "11:00" }), [mondayClass])).toBe(true);
    expect(clashesWithSchedule(event({ date: "2026-12-14", start: "10:00", end: "11:00" }), [mondayClass])).toBe(false);
  });

  describe("events crossing midnight", () => {
    const tuesdayEarly: BusyBlock = { weekday: 2, start: 0, end: 60, termEndsOn: TERM_END }; // Tue 12–1 AM

    it("checks the next day's blocks for the part after midnight", () => {
      const late = event({ start: "23:00", endsAt: at("2026-12-01", "00:30") });
      expect(clashesWithSchedule(late, [tuesdayEarly])).toBe(true);
    });

    it("applies the buffer across midnight", () => {
      expect(clashesWithSchedule(event({ start: "22:00", end: "23:50" }), [tuesdayEarly])).toBe(true);
      expect(clashesWithSchedule(event({ start: "22:00", end: "23:30" }), [tuesdayEarly])).toBe(false);
    });

    it("wraps from Sunday night to Monday morning", () => {
      const mondayEarly: BusyBlock = { weekday: 1, start: 30, end: 90, termEndsOn: TERM_END };
      const sundayNight = event({ date: "2026-12-06", start: "23:00", endsAt: at("2026-12-07", "01:00") });
      expect(clashesWithSchedule(sundayNight, [mondayEarly])).toBe(true);
    });

    it("doesn't apply the same day's late block to an event the next morning", () => {
      const mondayLate: BusyBlock = { weekday: 1, start: 22 * 60, end: 24 * 60, termEndsOn: TERM_END };
      expect(clashesWithSchedule(event({ date: "2026-12-01", start: "00:30", end: "01:30" }), [mondayLate])).toBe(false);
      expect(clashesWithSchedule(event({ date: "2026-12-01", start: "00:10", end: "01:30" }), [mondayLate])).toBe(true);
    });
  });

  it("does nothing with no blocks", () => {
    expect(clashesWithSchedule(event({ start: "10:00", end: "11:00" }), [])).toBe(false);
  });
});

describe("term end", () => {
  it("keeps only blocks still in effect", () => {
    const old = { ...mondayClass, termEndsOn: "2026-08-13" };
    expect(activeBlocks([mondayClass, old], "2026-11-30")).toEqual([mondayClass]);
  });

  it("says when a whole schedule has ended", () => {
    expect(scheduleExpired([mondayClass], "2026-12-11")).toBe(true);
    expect(scheduleExpired([mondayClass], "2026-12-10")).toBe(false);
    expect(scheduleExpired([], "2026-12-11")).toBe(false);
  });

  it("picks the current or next term", () => {
    expect(currentTerm("2026-11-30")?.name).toBe("Fall 2026");
    expect(currentTerm("2026-12-20")?.name).toBe("Winter 2027");
  });
});

describe("the weekly grid", () => {
  it("turns runs of tapped cells into blocks", () => {
    const cells = new Set([cellKey(1, 600), cellKey(1, 630), cellKey(1, 720), cellKey(3, 900)]);
    expect(blocksFromCells(cells, TERM_END)).toEqual([
      { weekday: 1, start: 600, end: 660, termEndsOn: TERM_END },
      { weekday: 1, start: 720, end: 750, termEndsOn: TERM_END },
      { weekday: 3, start: 900, end: 930, termEndsOn: TERM_END },
    ]);
  });

  it("shows saved blocks as the cells they cover", () => {
    // 10:30–11:20 covers the 10:30 and 11:00 cells.
    const cells = cellsFromBlocks([{ weekday: 2, start: 630, end: 680, termEndsOn: TERM_END }]);
    expect([...cells].sort()).toEqual([cellKey(2, 630), cellKey(2, 660)].sort());
  });
});

describe("mergeBlocks and isValidBlock", () => {
  it("merges overlapping and touching blocks on the same day", () => {
    const merged = mergeBlocks([
      { weekday: 1, start: 600, end: 660, termEndsOn: TERM_END },
      { weekday: 1, start: 660, end: 720, termEndsOn: TERM_END },
      { weekday: 1, start: 700, end: 750, termEndsOn: TERM_END },
      { weekday: 2, start: 600, end: 660, termEndsOn: TERM_END },
    ]);
    expect(merged).toEqual([
      { weekday: 1, start: 600, end: 750, termEndsOn: TERM_END },
      { weekday: 2, start: 600, end: 660, termEndsOn: TERM_END },
    ]);
  });

  it("rejects malformed blocks", () => {
    expect(isValidBlock(mondayClass)).toBe(true);
    expect(isValidBlock({ ...mondayClass, weekday: 0 })).toBe(false);
    expect(isValidBlock({ ...mondayClass, end: mondayClass.start })).toBe(false);
    expect(isValidBlock({ ...mondayClass, end: 1441 })).toBe(false);
    expect(isValidBlock({ ...mondayClass, termEndsOn: "2026-02-30" })).toBe(false);
  });
});
