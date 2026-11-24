// "Fits my schedule": a member's weekly busy blocks (classes) and whether an event clashes
// with them. Only the blocks are stored (public.busy_blocks): weekday, start, end, and the day
// the term's classes end. No course names, codes or rooms.

import { campus } from "@/lib/campus";
import { ASSUMED_LENGTH_MINUTES } from "@/lib/status";
import { addDays, toLocalInputs } from "@/lib/time";

export type BusyBlock = {
  weekday: number; // ISO: 1 is Monday, 7 is Sunday
  start: number; // minutes after campus-local midnight
  end: number; // after start, at most 1440
  termEndsOn: string; // "YYYY-MM-DD": the last day the block applies
};

/** Time kept clear around a class, to get there and away. */
export const BUFFER_MINUTES = 15;

const DAY = 24 * 60;

type Timing = { startsAt: string; endsAt: string | null; startTimeKnown: boolean };

/** ISO weekday (1 is Monday) of a "YYYY-MM-DD" date. */
export function isoWeekday(date: string): number {
  return ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** Whole days from 1970-01-01 to a "YYYY-MM-DD" date, so times on different days compare. */
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const dateOfDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Campus-local minute count since 1970-01-01 for an instant. */
function localMinute(iso: string): number {
  const { date, time } = toLocalInputs(iso);
  const [h, m] = time.split(":").map(Number);
  return dayNumber(date) * DAY + h * 60 + m;
}

/**
 * Whether the event, with the buffer before and after it, overlaps a busy block on any day it
 * touches, including an event that runs past midnight. An event with no announced start can't
 * be placed, so it never clashes; one with no end runs ASSUMED_LENGTH_MINUTES, as everywhere.
 * Blocks stop applying after their term's last day.
 */
export function clashesWithSchedule(e: Timing, blocks: BusyBlock[], buffer = BUFFER_MINUTES): boolean {
  if (!e.startTimeKnown || blocks.length === 0) return false;
  const start = localMinute(e.startsAt);
  const end = e.endsAt ? Math.max(localMinute(e.endsAt), start + 1) : start + ASSUMED_LENGTH_MINUTES;
  const from = start - buffer;
  const to = end + buffer;
  for (let day = Math.floor(from / DAY); day <= Math.floor((to - 1) / DAY); day++) {
    const date = dateOfDay(day);
    const weekday = isoWeekday(date);
    for (const b of blocks) {
      if (b.weekday !== weekday || date > b.termEndsOn) continue;
      if (from < day * DAY + b.end && to > day * DAY + b.start) return true;
    }
  }
  return false;
}

/** The blocks still in effect on `today`. */
export const activeBlocks = (blocks: BusyBlock[], today: string) => blocks.filter((b) => b.termEndsOn >= today);

/** True when a member had a schedule and every block of it has ended: time to add the new term's. */
export const scheduleExpired = (blocks: BusyBlock[], today: string) => blocks.length > 0 && activeBlocks(blocks, today).length === 0;

/** Overlapping or touching blocks on the same day and term, merged into one. */
export function mergeBlocks(blocks: BusyBlock[]): BusyBlock[] {
  const sorted = [...blocks].sort((a, b) => a.weekday - b.weekday || a.termEndsOn.localeCompare(b.termEndsOn) || a.start - b.start);
  const out: BusyBlock[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && last.weekday === b.weekday && last.termEndsOn === b.termEndsOn && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/** Whether a block is well-formed: a real weekday, start before end, inside one day, a real date. */
export function isValidBlock(b: BusyBlock): boolean {
  return (
    Number.isInteger(b.weekday) &&
    b.weekday >= 1 &&
    b.weekday <= 7 &&
    Number.isInteger(b.start) &&
    Number.isInteger(b.end) &&
    b.start >= 0 &&
    b.end <= DAY &&
    b.start < b.end &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.termEndsOn) &&
    addDays(b.termEndsOn, 0) === b.termEndsOn
  );
}

// ── Terms ──────────────────────────────────────────────────────────────────────────────

export type Term = { name: string; classesStart: string; classesEnd: string };
export const TERMS: Term[] = campus.terms;

/** The term whose classes are on now, or the next one to start (to set a new schedule's end). */
export function currentTerm(today: string, terms: Term[] = TERMS): Term | null {
  return terms.find((t) => t.classesEnd >= today) ?? null;
}

// ── The weekly grid ────────────────────────────────────────────────────────────────────

/** The tap-in grid: half-hour cells, 8 AM to 10 PM. */
export const GRID = { firstMinute: 8 * 60, lastMinute: 22 * 60, step: 30 } as const;
export const GRID_ROWS = (GRID.lastMinute - GRID.firstMinute) / GRID.step;

/** A cell's key: weekday and the minute it starts. */
export const cellKey = (weekday: number, minute: number) => `${weekday}:${minute}`;

/** Tapped cells as blocks: runs of consecutive cells on a day become one block. */
export function blocksFromCells(cells: Set<string>, termEndsOn: string): BusyBlock[] {
  const blocks: BusyBlock[] = [];
  for (let weekday = 1; weekday <= 7; weekday++) {
    let open: BusyBlock | null = null;
    for (let minute = GRID.firstMinute; minute < GRID.lastMinute; minute += GRID.step) {
      if (cells.has(cellKey(weekday, minute))) {
        if (open) open.end = minute + GRID.step;
        else open = { weekday, start: minute, end: minute + GRID.step, termEndsOn };
      } else if (open) {
        blocks.push(open);
        open = null;
      }
    }
    if (open) blocks.push(open);
  }
  return blocks;
}

/** Blocks as grid cells, for editing a saved schedule: every cell a block covers any part of. */
export function cellsFromBlocks(blocks: BusyBlock[]): Set<string> {
  const cells = new Set<string>();
  for (const b of blocks) {
    for (let minute = GRID.firstMinute; minute < GRID.lastMinute; minute += GRID.step) {
      if (minute < b.end && minute + GRID.step > b.start) cells.add(cellKey(b.weekday, minute));
    }
  }
  return cells;
}

/** "9:30 AM" for minutes after midnight. */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
