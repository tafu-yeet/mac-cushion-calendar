import { describe, expect, it } from "vitest";

import { weeklyBlocksFromIcs } from "@/lib/ics-import";

const TORONTO = `BEGIN:VTIMEZONE
TZID:America/Toronto
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

const calendar = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", TORONTO, ...events, "END:VCALENDAR"].join("\r\n");

const vevent = (lines: string) => `BEGIN:VEVENT\r\n${lines.trim().split("\n").map((l) => l.trim()).join("\r\n")}\r\nEND:VEVENT`;

const opts = { today: "2026-11-23", termEnd: "2026-12-10" };

describe("weeklyBlocksFromIcs", () => {
  it("finds a weekly class with its days, times and last day", () => {
    const ics = calendar(
      vevent(`
        UID:comp-1
        SUMMARY:COMPSCI 1MD3 C01
        DTSTART;TZID=America/Toronto:20260908T103000
        DTEND;TZID=America/Toronto:20260908T112000
        RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261210T235959Z
      `),
    );
    const { blocks } = weeklyBlocksFromIcs(ics, opts);
    expect(blocks.map(({ weekday, start, end, termEndsOn }) => ({ weekday, start, end, termEndsOn }))).toEqual([
      { weekday: 2, start: 630, end: 680, termEndsOn: "2026-12-08" },
      { weekday: 4, start: 630, end: 680, termEndsOn: "2026-12-10" },
    ]);
    // The name is only for the member to recognize it on their phone.
    expect(blocks[0].label).toBe("COMPSCI 1MD3 C01");
  });

  it("gives a weekly repeat with no end date the term's last day", () => {
    const ics = calendar(
      vevent(`
        UID:lab
        SUMMARY:Lab
        DTSTART;TZID=America/Toronto:20260911T143000
        DTEND;TZID=America/Toronto:20260911T172000
        RRULE:FREQ=WEEKLY
      `),
    );
    expect(weeklyBlocksFromIcs(ics, opts).blocks).toMatchObject([{ weekday: 5, start: 870, end: 1040, termEndsOn: "2026-12-10" }]);
  });

  it("reads UTC times in campus time", () => {
    // 15:30 UTC on a December Monday is 10:30 in Toronto.
    const ics = calendar(
      vevent(`
        UID:utc
        SUMMARY:Tutorial
        DTSTART:20261130T153000Z
        DTEND:20261130T162000Z
        RRULE:FREQ=WEEKLY;COUNT=3
      `),
    );
    expect(weeklyBlocksFromIcs(ics, opts).blocks).toMatchObject([{ weekday: 1, start: 630, end: 680, termEndsOn: "2026-12-14" }]);
  });

  it("treats the same one-off event at the same weekday and time twice as weekly", () => {
    const ics = calendar(
      vevent(`
        UID:a
        SUMMARY:Seminar
        DTSTART;TZID=America/Toronto:20261125T090000
        DTEND;TZID=America/Toronto:20261125T100000
      `),
      vevent(`
        UID:b
        SUMMARY:Seminar
        DTSTART;TZID=America/Toronto:20261202T090000
        DTEND;TZID=America/Toronto:20261202T100000
      `),
      vevent(`
        UID:c
        SUMMARY:Dentist
        DTSTART;TZID=America/Toronto:20261126T090000
        DTEND;TZID=America/Toronto:20261126T100000
      `),
    );
    expect(weeklyBlocksFromIcs(ics, opts).blocks).toMatchObject([{ weekday: 3, start: 540, end: 600, label: "Seminar", times: 2, termEndsOn: "2026-12-02" }]);
  });

  it("skips all-day events, very long ones and ones already over", () => {
    const ics = calendar(
      vevent(`
        UID:allday
        SUMMARY:Reading week
        DTSTART;VALUE=DATE:20261130
        DTEND;VALUE=DATE:20261201
        RRULE:FREQ=WEEKLY;COUNT=3
      `),
      vevent(`
        UID:shift
        SUMMARY:Shift
        DTSTART;TZID=America/Toronto:20261130T080000
        DTEND;TZID=America/Toronto:20261130T160000
        RRULE:FREQ=WEEKLY;COUNT=3
      `),
      vevent(`
        UID:past
        SUMMARY:Summer course
        DTSTART;TZID=America/Toronto:20260601T090000
        DTEND;TZID=America/Toronto:20260601T100000
        RRULE:FREQ=WEEKLY;UNTIL=20260801T000000Z
      `),
    );
    // Only timed events count as read: the all-day one isn't.
    expect(weeklyBlocksFromIcs(ics, opts)).toEqual({ blocks: [], events: 2 });
  });

  it("leaves out weeks a class was cancelled (EXDATE)", () => {
    const ics = calendar(
      vevent(`
        UID:ex
        SUMMARY:Lecture
        DTSTART;TZID=America/Toronto:20261130T130000
        DTEND;TZID=America/Toronto:20261130T140000
        RRULE:FREQ=WEEKLY;COUNT=2
        EXDATE;TZID=America/Toronto:20261207T130000
      `),
    );
    // One occurrence left, but it's still a weekly repeat.
    expect(weeklyBlocksFromIcs(ics, opts).blocks).toMatchObject([{ weekday: 1, times: 1, termEndsOn: "2026-11-30" }]);
  });

  it("throws on a file that isn't a calendar", () => {
    expect(() => weeklyBlocksFromIcs("hello", opts)).toThrow();
  });
});
