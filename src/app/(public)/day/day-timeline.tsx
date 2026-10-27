import Link from "next/link";

import { ScheduleBadge, StatusBadge } from "@/components/event-card";
import { UtensilsIcon } from "@/components/icons";
import { categoryOf } from "@/lib/categories";
import { freeFoodPhrase } from "@/lib/clean";
import type { PublicEvent } from "@/lib/events";
import { ASSUMED_LENGTH_MINUTES } from "@/lib/status";
import { formatTime, formatTimeRange, minutesIntoDay, toLocalInputs } from "@/lib/time";

const PX_PER_MINUTE = 1.1;
const MIN_MINUTES = 30; // so short events stay readable
// More side-by-side events than this get too narrow to read, so a busy stretch is listed instead.
const MAX_LANES = 2;
const DAY_END = 24 * 60;
const EARLIEST_SHOWN_HOUR = 8; // the timeline starts here, or earlier if something does
const ROOM_FOR_DETAILS_PX = 80; // shorter blocks show the name, time and food, but not the place
const BLOCK_GAP_PX = 3;
// A busy stretch's events are listed by the hour they start, in rows this size.
const ROW_PX = 40;
const ROW_GAP_PX = 4;
const LIST_PADDING_PX = 6;

type Placed = { event: PublicEvent; start: number; end: number; lane: number };
type Cluster = { start: number; end: number; lanes: number; items: Placed[] };
/** Events side by side on the timeline, sized by when they start and end. */
type Blocks = { kind: "blocks"; lanes: number; items: Placed[] };
/** A busy stretch's events starting in one hour, listed where that hour (or the stretch) begins. */
type HourList = { kind: "list"; start: number; items: Placed[] };

/** Runs of overlapping events, each event given a side-by-side lane. */
function clusterEvents(day: string, events: PublicEvent[]): Cluster[] {
  const items = events
    .filter((e) => e.startTimeKnown)
    .map((e) => {
      const start = minutesIntoDay(e.startsAt);
      let end = e.endsAt ? minutesIntoDay(e.endsAt) : start + ASSUMED_LENGTH_MINUTES;
      if (e.endsAt && toLocalInputs(e.endsAt).date !== day) end = DAY_END; // runs past midnight
      return { event: e, start, end: Math.min(Math.max(end, start + MIN_MINUTES), DAY_END), lane: 0 };
    })
    .sort((a, b) => a.start - b.start);

  const clusters: Cluster[] = [];
  for (const item of items) {
    const last = clusters.at(-1);
    if (last && item.start < last.end) {
      last.items.push(item);
      last.end = Math.max(last.end, item.end);
    } else {
      clusters.push({ start: item.start, end: item.end, lanes: 1, items: [item] });
    }
  }
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    for (const item of cluster.items) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) lane = laneEnds.push(item.end) - 1;
      else laneEnds[lane] = item.end;
      item.lane = lane;
    }
    cluster.lanes = laneEnds.length;
  }
  return clusters;
}

/**
 * What to draw: quiet stretches as blocks on the timeline; a stretch with more
 * events at once than fit side by side as lists, one per hour that events start in.
 * Overlap chains (A overlaps B, B overlaps C), so a busy afternoon can join a whole
 * day into one cluster: listing it hour by hour keeps each event at its own time.
 */
function layout(day: string, events: PublicEvent[]): (Blocks | HourList)[] {
  const parts: (Blocks | HourList)[] = [];
  for (const cluster of clusterEvents(day, events)) {
    if (cluster.lanes <= MAX_LANES) {
      parts.push({ kind: "blocks", lanes: cluster.lanes, items: cluster.items });
      continue;
    }
    const byHour = new Map<number, Placed[]>();
    for (const item of cluster.items) {
      const start = Math.max(cluster.start, Math.floor(item.start / 60) * 60);
      byHour.set(start, [...(byHour.get(start) ?? []), item]);
    }
    for (const [start, items] of byHour) parts.push({ kind: "list", start, items });
  }
  return parts;
}

const listHeight = (rows: number) => 2 * LIST_PADDING_PX + rows * ROW_PX + (rows - 1) * ROW_GAP_PX;

/**
 * Minutes into the day to pixels down the timeline: PX_PER_MINUTE, except that a
 * list gets the room its rows need, pushing everything after it down. The scale
 * bends at every hour and every start, so a stretched list never runs into the
 * next hour's list or a later block.
 */
function timelineScale(origin: number, parts: (Blocks | HourList)[]): (minutes: number) => number {
  const starts = parts.flatMap((p) => (p.kind === "list" ? [p.start] : p.items.map((i) => i.start)));
  const hours = Array.from({ length: (DAY_END - origin) / 60 + 1 }, (_, i) => origin + i * 60);
  const breaks = [...new Set([...hours, ...starts])].sort((a, b) => a - b);
  const room = new Map(parts.flatMap((p) => (p.kind === "list" ? [[p.start, listHeight(p.items.length) + BLOCK_GAP_PX] as const] : [])));
  const tops = [0];
  for (let i = 0; i < breaks.length - 1; i++) {
    tops.push(tops[i] + Math.max((breaks[i + 1] - breaks[i]) * PX_PER_MINUTE, room.get(breaks[i]) ?? 0));
  }
  return (minutes) => {
    if (minutes >= DAY_END) return tops[tops.length - 1];
    let i = 0;
    while (i < breaks.length - 2 && breaks[i + 1] <= minutes) i++;
    return tops[i] + ((minutes - breaks[i]) / (breaks[i + 1] - breaks[i])) * (tops[i + 1] - tops[i]);
  };
}

const hourLabel = (hour: number) => (hour === 0 ? "12 am" : hour === 12 ? "12 pm" : hour > 12 ? `${hour - 12} pm` : `${hour} am`);

/** One day's timed events on an hour scale; for today, pass `now` for a line at the current time and "On now" badges. */
export function DayTimeline({ date, events, now }: { date: string; events: PublicEvent[]; now: number | null }) {
  const nowMinutes = now === null ? null : minutesIntoDay(new Date(now).toISOString());
  const parts = layout(date, events);
  const earliest = Math.min(...parts.map((p) => (p.kind === "list" ? p.start : p.items[0].start)), DAY_END);
  const firstHour = Math.min(EARLIEST_SHOWN_HOUR, Math.floor(earliest / 60));
  const origin = firstHour * 60;
  const y = timelineScale(origin, parts);
  const span = (start: number, end: number) => ({
    top: y(start),
    height: Math.max(y(end) - y(start), MIN_MINUTES * PX_PER_MINUTE) - BLOCK_GAP_PX,
  });
  const hours = Array.from({ length: 24 - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <div className="relative" style={{ height: y(DAY_END) }}>
      {hours.map((hour) => (
        <div key={hour} className="absolute inset-x-0 flex items-center gap-3" style={{ top: y(hour * 60) }}>
          <span className="w-11 shrink-0 -translate-y-px text-right text-[11px] font-semibold text-maroon/75">
            {hour < 24 ? hourLabel(hour) : ""}
          </span>
          <span className="h-px flex-1 bg-maroon/10" />
        </div>
      ))}

      <div className="absolute inset-y-0 left-14 right-0">
        {parts.map((part) =>
          part.kind === "list" ? (
            <HourEvents key={`list-${part.start}`} items={part.items} now={now} style={{ top: y(part.start), height: listHeight(part.items.length) }} />
          ) : (
            part.items.map(({ event, start, end, lane }) => (
              <EventBlock
                key={event.id}
                event={event}
                now={now}
                style={{
                  ...span(start, end),
                  left: `calc(${(lane / part.lanes) * 100}% + 2px)`,
                  width: `calc(${100 / part.lanes}% - 4px)`,
                }}
              />
            ))
          ),
        )}

        {nowMinutes !== null && nowMinutes >= origin && (
          <div className="pointer-events-none absolute inset-x-0 z-0 flex items-center" style={{ top: y(nowMinutes) }} aria-hidden="true">
            <span className="-ml-1.5 size-3 rounded-full border-2 border-panel bg-maroon" />
            <span className="h-0.5 flex-1 bg-maroon" />
          </div>
        )}
      </div>
    </div>
  );
}

function EventBlock({ event, now, style }: { event: PublicEvent; now: number | null; style: React.CSSProperties & { height: number } }) {
  const tone = categoryOf(event.category).tone;
  const roomy = style.height >= ROOM_FOR_DETAILS_PX;
  return (
    <Link
      href={`/events/${event.id}`}
      title={[event.name, event.hasFreeFood && freeFoodPhrase(event.foodDescription)].filter(Boolean).join(" · ")}
      className={`absolute z-10 flex flex-col gap-1 overflow-hidden rounded-2xl px-3 py-2 text-xs leading-tight transition-shadow hover:z-20 hover:shadow-md ${tone.card}`}
      style={style}
    >
      {event.scheduleStatus !== "scheduled" ? (
        <span className="text-[10px] leading-none">
          <ScheduleBadge status={event.scheduleStatus} />
        </span>
      ) : (
        now !== null && (
          <span className="text-[10px] leading-none">
            <StatusBadge event={event} now={now} className={tone.accent} />
          </span>
        )
      )}
      <span className={`font-display text-sm font-semibold leading-tight ${event.scheduleStatus === "cancelled" ? "line-through" : ""}`}>
        {event.name}
      </span>
      <span className="opacity-90">{formatTimeRange(event.startsAt, event.endsAt, true)}</span>
      {event.hasFreeFood && (
        <span className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 font-semibold ${tone.accent}`}>
          <UtensilsIcon className="size-3 shrink-0" />
          <span className="line-clamp-1 first-letter:uppercase">{event.foodDescription ?? "Free food"}</span>
        </span>
      )}
      {roomy && event.location && <span className="line-clamp-1 opacity-90">{event.location}</span>}
    </Link>
  );
}

/** A busy hour: its events one per row, each at its own start time. */
function HourEvents({ items, now, style }: { items: Placed[]; now: number | null; style: React.CSSProperties }) {
  return (
    <ul className="absolute inset-x-0.5 z-10 flex flex-col rounded-2xl bg-canvas ring-1 ring-maroon/20" style={{ ...style, padding: LIST_PADDING_PX, gap: ROW_GAP_PX }}>
      {items.map(({ event }) => {
        const tone = categoryOf(event.category).tone;
        return (
          <li key={event.id}>
            <Link
              href={`/events/${event.id}`}
              title={[event.name, event.hasFreeFood && freeFoodPhrase(event.foodDescription)].filter(Boolean).join(" · ")}
              className={`flex items-center gap-2 rounded-xl px-2.5 text-xs leading-tight hover:opacity-90 ${tone.card}`}
              style={{ height: ROW_PX }}
            >
              <span className="w-14 shrink-0 font-medium opacity-90">{formatTime(event.startsAt)}</span>
              <span className={`min-w-0 truncate font-semibold ${event.scheduleStatus === "cancelled" ? "line-through" : ""}`}>{event.name}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {event.scheduleStatus !== "scheduled" ? (
                  <span className="text-[10px] leading-none">
                    <ScheduleBadge status={event.scheduleStatus} />
                  </span>
                ) : (
                  now !== null && (
                    <span className="hidden text-[10px] leading-none sm:inline">
                      <StatusBadge event={event} now={now} className={tone.accent} />
                    </span>
                  )
                )}
                {event.hasFreeFood && (
                  <>
                    <UtensilsIcon className="size-3.5" />
                    <span className="sr-only">Free food</span>
                  </>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
