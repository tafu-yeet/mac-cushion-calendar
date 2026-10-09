// Dates and times in the campus timezone. Events are stored as UTC instants;
// people read and enter them as campus wall-clock time.

import { TIMEZONE } from "@/lib/campus";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(instant: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return values as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

/** Campus-local date ("2026-10-07") and time ("18:00") of a stored instant. */
export function toLocalInputs(iso: string | null, timeZone = TIMEZONE): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const p = parts(new Date(iso), timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** UTC ISO string for a campus wall-clock date and time. */
export function fromLocalInputs(date: string, time: string, timeZone = TIMEZONE): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  // The zone's offset at that moment; re-check once in case the first guess
  // landed on the other side of a daylight-saving change.
  const offsetAt = (utc: number) => {
    const p = parts(new Date(utc), timeZone);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utc;
  };
  let utc = wallAsUtc - offsetAt(wallAsUtc);
  const second = offsetAt(utc);
  if (wallAsUtc - second !== utc) utc = wallAsUtc - second;
  return new Date(utc).toISOString();
}

/** Short weekday ("Wed") for a plain date string ("2026-10-07"). */
export function weekdayOf(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** "Wed Oct 7, 6:00 PM" (or "Wed Oct 7, time TBD") in campus time. */
export function formatWhen(iso: string | null, timeKnown = true, timeZone = TIMEZONE): string {
  if (!iso) return "No date";
  const instant = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(instant);
  if (!timeKnown) return `${day}, time TBD`;
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(instant);
  return `${day}, ${time}`;
}

/** Start of today in campus time, as a UTC ISO string. */
export function startOfTodayIso(timeZone = TIMEZONE): string {
  return fromLocalInputs(todayInCampus(timeZone), "00:00", timeZone);
}

/** Today's campus-local date, "YYYY-MM-DD". Reads the clock: call at request time. */
export function todayInCampus(timeZone = TIMEZONE): string {
  return toLocalInputs(new Date().toISOString(), timeZone).date;
}

/** Plain date string plus n days (n may be negative). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday on or before a plain date. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** Start of a campus-local day as a UTC ISO string. */
export function dayStartIso(date: string, timeZone = TIMEZONE): string {
  return fromLocalInputs(date, "00:00", timeZone);
}

/** "Wednesday, October 7" for a plain date string. */
export function formatDay(date: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: style,
    month: style,
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "6:00 PM", or "6:00–8:00 PM", or "Time TBD", in campus time. */
export function formatTimeRange(startIso: string, endIso: string | null, timeKnown: boolean, timeZone = TIMEZONE): string {
  if (!timeKnown) return "Time TBD";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const start = fmt(startIso);
  if (!endIso) return start;
  const end = fmt(endIso);
  // "6:00 PM–8:00 PM" reads better as "6:00–8:00 PM" when both are PM.
  const [startTime, startPeriod] = start.split(" ");
  const [, endPeriod] = end.split(" ");
  return startPeriod === endPeriod ? `${startTime}–${end}` : `${start}–${end}`;
}

/** "3:00 PM" in campus time. */
export function formatTime(iso: string, timeZone = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "30 min", "1h", or "2h 15m" between two instants (short, for a pill); null without an end after the start. */
export function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const minutes = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} min` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The pieces of a big date display: { weekday: "Friday", day: "09", month: "OCT" }. */
export function dateParts(date: string): { weekday: string; day: string; month: string } {
  const instant = new Date(`${date}T12:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(instant);
  return { weekday: part({ weekday: "long" }), day: date.slice(8), month: part({ month: "short" }).toUpperCase() };
}

/** Minutes after campus-local midnight for an instant. */
export function minutesIntoDay(iso: string, timeZone = TIMEZONE): number {
  const { time } = toLocalInputs(iso, timeZone);
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
