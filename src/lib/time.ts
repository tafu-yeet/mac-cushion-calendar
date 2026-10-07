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
  const { date } = toLocalInputs(new Date().toISOString(), timeZone);
  return fromLocalInputs(date, "00:00", timeZone);
}
