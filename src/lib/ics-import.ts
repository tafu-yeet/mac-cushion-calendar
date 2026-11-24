// Reads a calendar file (.ics, exported from Google, Outlook or Apple Calendar) in the browser
// and finds the weekly blocks in it: classes, labs, tutorials. Course names stay on the phone,
// shown only so the member can pick which blocks to keep; only weekday, start, end and the
// term's last day are saved (src/lib/schedule.ts). Uses ical.js, Mozilla's iCalendar parser,
// which handles time zones, weekly repeats and their exceptions.

import ICAL from "ical.js";

import { isoWeekday, type BusyBlock } from "@/lib/schedule";
import { addDays, toLocalInputs } from "@/lib/time";

/** A weekly block found in the file, with what it was called there (never saved). */
export type FoundBlock = BusyBlock & { label: string; times: number };

/** The blocks found, and how many timed events the file had (all-day ones aren't counted). */
export type IcsResult = { blocks: FoundBlock[]; events: number };

const HORIZON_DAYS = 150; // a term and a bit
const MAX_OCCURRENCES = 400; // per event, so a daily repeat with no end can't run forever
const MIN_MINUTES = 10;
const MAX_MINUTES = 6 * 60; // longer than a lab: a trip, a shift, a placeholder

function minuteOf(iso: string): number {
  const { time } = toLocalInputs(iso);
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The weekly blocks in a calendar file from `today` on: every event that repeats weekly, or
 * happens at least twice at the same weekday and time. A block's term ends on its last
 * occurrence; a repeat with no end date takes `termEnd` (the current term's last day of
 * classes). Throws if the file isn't a calendar.
 */
export function weeklyBlocksFromIcs(text: string, opts: { today: string; termEnd: string }): IcsResult {
  const root = new ICAL.Component(ICAL.parse(text));
  const calendars = root.name === "vcalendar" ? [root] : root.getAllSubcomponents("vcalendar");
  if (calendars.length === 0) throw new Error("not a calendar file");

  const horizon = addDays(opts.today, HORIZON_DAYS);
  const groups = new Map<string, FoundBlock & { last: string; weekly: boolean }>();
  let events = 0;

  for (const calendar of calendars) {
    for (const tz of calendar.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);

    for (const component of calendar.getAllSubcomponents("vevent")) {
      const event = new ICAL.Event(component);
      // A changed single occurrence is listed on its own; the repeating event already covers its week.
      if (event.isRecurrenceException() || !event.startDate || event.startDate.isDate) continue;
      events++;
      const label = (event.summary || "Untitled").trim().slice(0, 80);
      const weekly = event.isRecurring() && /FREQ=WEEKLY/i.test(String(component.getFirstPropertyValue("rrule") ?? ""));

      const occurrences: { start: string; end: string }[] = [];
      if (event.isRecurring()) {
        const it = event.iterator();
        for (let i = 0, next = it.next(); next && i < MAX_OCCURRENCES; i++, next = it.next()) {
          const details = event.getOccurrenceDetails(next);
          const start = details.startDate.toJSDate().toISOString();
          if (toLocalInputs(start).date > horizon) break;
          occurrences.push({ start, end: details.endDate.toJSDate().toISOString() });
        }
      } else {
        occurrences.push({ start: event.startDate.toJSDate().toISOString(), end: event.endDate.toJSDate().toISOString() });
      }

      for (const o of occurrences) {
        const date = toLocalInputs(o.start).date;
        if (date < opts.today || date > horizon) continue;
        const minutes = (Date.parse(o.end) - Date.parse(o.start)) / 60_000;
        if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) continue;
        const start = minuteOf(o.start);
        // A block stays inside its day; a class doesn't run past midnight.
        const end = Math.min(start + Math.round(minutes), 24 * 60);
        const weekday = isoWeekday(date);
        const key = `${weekday}|${start}|${end}|${label.toLowerCase()}`;
        const group = groups.get(key);
        if (group) {
          group.times++;
          if (date > group.last) group.last = date;
          group.weekly ||= weekly;
        } else {
          groups.set(key, { weekday, start, end, termEndsOn: "", label, times: 1, last: date, weekly });
        }
      }
    }
  }

  const blocks = [...groups.values()]
    .filter((g) => g.weekly || g.times >= 2)
    .map(({ last, weekly, ...g }) => ({
      ...g,
      // Repeats that run to the end of what we read have no real end: the term's last day.
      termEndsOn: weekly && last > addDays(horizon, -8) ? opts.termEnd : last,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start || a.label.localeCompare(b.label));
  return { blocks, events };
}
