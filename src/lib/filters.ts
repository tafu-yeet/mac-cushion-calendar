// What the public pages filter by, kept in the URL so a filtered view can be
// shared: ?day=tomorrow&time=evening&cat=social,arts&food=1&free=1&all=1&q=karaoke

import { categoryOf, isCategory, type Category } from "@/lib/categories";
import type { PublicEvent } from "@/lib/events";
import { minutesIntoDay, toLocalInputs } from "@/lib/time";

export const TIME_PRESETS = {
  morning: { label: "Morning", from: "06:00", to: "12:00" },
  afternoon: { label: "Afternoon", from: "12:00", to: "17:00" },
  evening: { label: "Evening", from: "17:00", to: "24:00" },
} as const;
export type TimePreset = keyof typeof TIME_PRESETS;

export const DAYS = { today: "Today", tomorrow: "Tomorrow", week: "Next 7 days" } as const;
export type Day = keyof typeof DAYS;

export type Filters = {
  day: Day;
  time: TimePreset | "custom" | null; // null: any time
  from: string; // "HH:MM", used when time is "custom"
  to: string;
  categories: Category[]; // empty: every category
  food: boolean; // only events with free food
  freeEntry: boolean; // only events that cost nothing to attend
  limited: boolean; // also show events limited to a group
  q: string;
};

export const DEFAULT_FILTERS: Filters = {
  day: "today",
  time: null,
  from: "",
  to: "",
  categories: [],
  food: false,
  freeEntry: false,
  limited: false,
  q: "",
};

/** The URL keys these filters own; anything else in the URL (like the week's start) is left alone. */
export const FILTER_KEYS = ["day", "time", "from", "to", "cat", "food", "free", "all", "q"] as const;

type Params = Record<string, string | string[] | undefined>;
const HHMM = /^([01]\d|2[0-4]):[0-5]\d$/;

export function parseFilters(params: Params): Filters {
  const get = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const time = get("time");
  const from = get("from");
  const to = get("to");
  const custom = HHMM.test(from) && HHMM.test(to) && from < to;
  return {
    day: get("day") in DAYS ? (get("day") as Day) : "today",
    time: time in TIME_PRESETS ? (time as TimePreset) : custom ? "custom" : null,
    from: custom ? from : "",
    to: custom ? to : "",
    categories: get("cat").split(",").filter(isCategory),
    food: get("food") === "1",
    freeEntry: get("free") === "1",
    limited: get("all") === "1",
    q: get("q").slice(0, 100),
  };
}

/** URL parameters for these filters, leaving out defaults. */
export function filterParams(f: Filters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.day !== "today") out.day = f.day;
  if (f.time === "custom") Object.assign(out, { from: f.from, to: f.to });
  else if (f.time) out.time = f.time;
  if (f.categories.length) out.cat = f.categories.join(",");
  if (f.food) out.food = "1";
  if (f.freeEntry) out.free = "1";
  if (f.limited) out.all = "1";
  if (f.q.trim()) out.q = f.q.trim();
  return out;
}

export function sameFilters(a: Filters, b: Filters): boolean {
  return JSON.stringify(filterParams(a)) === JSON.stringify(filterParams(b));
}

/** True when anything narrows the list, apart from the day. */
export function isNarrowed(f: Filters): boolean {
  return !!(f.time || f.categories.length || f.food || f.freeEntry || f.limited || f.q.trim());
}

/** The chosen time window in minutes after midnight, or null for any time. */
export function timeWindow(f: Filters): [number, number] | null {
  const range = f.time === "custom" ? f : f.time ? TIME_PRESETS[f.time] : null;
  if (!range) return null;
  const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  return [minutes(range.from), minutes(range.to)];
}

// Without an end time, an event counts as running this long.
const ASSUMED_MINUTES = 60;

/** Start and end in minutes after its day's midnight; the end is capped at midnight. */
export function eventSpan(e: PublicEvent): [number, number] {
  const start = minutesIntoDay(e.startsAt);
  if (!e.endsAt) return [start, start + ASSUMED_MINUTES];
  const sameDay = toLocalInputs(e.endsAt).date === toLocalInputs(e.startsAt).date;
  return [start, sameDay ? Math.max(minutesIntoDay(e.endsAt), start + 1) : 24 * 60];
}

/**
 * Whether the event overlaps the window, so you could drop in while you're free.
 * Events with no announced time can't be placed: "unknown".
 */
export function inWindow(e: PublicEvent, slot: [number, number] | null): boolean | "unknown" {
  if (!slot) return true;
  if (!e.startTimeKnown) return "unknown";
  const [start, end] = eventSpan(e);
  return start < slot[1] && end > slot[0];
}

/** Every filter except day and time, which the pages apply themselves. */
export function matchesFilters(e: PublicEvent, f: Filters): boolean {
  if (f.categories.length && !f.categories.includes(e.category)) return false;
  if (f.food && !e.hasFreeFood) return false;
  if (f.freeEntry && e.cost !== "free") return false;
  if (!f.limited && !e.openToAll) return false;
  return matchesSearch(e, f.q);
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Every word of the query appears somewhere in the event's text. */
function matchesSearch(e: PublicEvent, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold(
    [
      e.name,
      e.clubName,
      e.clubUsername,
      e.hostedBy,
      e.location,
      e.foodDescription,
      e.hasFreeFood ? "free food" : "",
      categoryOf(e.category).label,
      e.eventType,
      ...e.tags,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return words.every((w) => text.includes(w));
}

/** Earliest first, with a day's time-TBD events after its timed ones. */
export function byStart(a: PublicEvent, b: PublicEvent): number {
  // Campus-local "YYYY-MM-DDTHH:MM"; "~" sorts after any time.
  const key = (e: PublicEvent) => {
    const { date, time } = toLocalInputs(e.startsAt);
    return e.startTimeKnown ? `${date}T${time}` : `${date}~`;
  };
  return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
}
