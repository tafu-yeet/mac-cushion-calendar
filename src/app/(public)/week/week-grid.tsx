import Link from "next/link";

import type { PublicEvent } from "@/lib/events";
import { formatTimeRange, minutesIntoDay, toLocalInputs } from "@/lib/time";

import type { WeekDay } from "./types";

const FIRST_HOUR = 8;
const LAST_HOUR = 24;
const PX_PER_MINUTE = 0.9;
const DEFAULT_MINUTES = 60;
const MIN_MINUTES = 30; // so short events stay readable
// More side-by-side events than this get too narrow to read, so they become one list block.
const MAX_LANES = 2;

type Placed = { event: PublicEvent; start: number; end: number; lane: number };
type Cluster = { start: number; end: number; lanes: number; items: Placed[] };

/** Groups each day's timed events into runs of overlapping events, each given a side-by-side lane. */
function clusterEvents(day: string, events: PublicEvent[]): Cluster[] {
  const items = events
    .filter((e) => e.startTimeKnown)
    .map((e) => {
      const start = minutesIntoDay(e.startsAt);
      let end = e.endsAt ? minutesIntoDay(e.endsAt) : start + DEFAULT_MINUTES;
      if (e.endsAt && toLocalInputs(e.endsAt).date !== day) end = LAST_HOUR * 60; // runs past midnight
      return { event: e, start, end: Math.max(end, start + MIN_MINUTES), lane: 0 };
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

/** Pixel offset and height for a span of minutes, clipped to the visible hours. */
function verticalSpan(start: number, end: number) {
  const top = (Math.max(start, FIRST_HOUR * 60) - FIRST_HOUR * 60) * PX_PER_MINUTE;
  const bottom = (Math.min(end, LAST_HOUR * 60) - FIRST_HOUR * 60) * PX_PER_MINUTE;
  return { top, height: Math.max(bottom - top, MIN_MINUTES * PX_PER_MINUTE) };
}

const hourLabel = (h: number) => (h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`);

export function WeekGrid({ days }: { days: WeekDay[] }) {
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const height = (LAST_HOUR - FIRST_HOUR) * 60 * PX_PER_MINUTE;
  const anyTimeless = days.some((d) => d.events.some((e) => !e.startTimeKnown));
  const cols = "grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className={`${cols} border-b border-stone-200`}>
        <div />
        {days.map((d) => (
          <div key={d.date} className={`border-l border-stone-100 px-2 py-2 text-center ${d.isToday ? "bg-emerald-50" : ""}`}>
            <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{d.weekday}</div>
            <div className={`text-lg font-semibold ${d.isToday ? "text-emerald-700" : "text-stone-900"}`}>{d.dayOfMonth}</div>
          </div>
        ))}
      </div>

      {anyTimeless && (
        <div className={`${cols} border-b border-stone-200 bg-stone-50`}>
          <div className="px-1 py-2 text-right text-[10px] font-medium uppercase leading-tight text-stone-400">Time TBD</div>
          {days.map((d) => (
            <div key={d.date} className="flex flex-col gap-1 border-l border-stone-100 p-1">
              {d.events
                .filter((e) => !e.startTimeKnown)
                .map((e) => (
                  <Link key={e.id} href={`/events/${e.id}`} className="truncate rounded-md bg-emerald-50 px-1.5 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100">
                    {e.name}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      )}

      <div className={cols} style={{ height }}>
        <div className="relative">
          {hours.map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-stone-400" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MINUTE }}>
              {h === FIRST_HOUR ? "" : hourLabel(h)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d.date} className={`relative border-l border-stone-100 ${d.isToday ? "bg-emerald-50/40" : ""}`}>
            {hours.map((h) => (
              <div key={h} className="absolute inset-x-0 border-t border-stone-100" style={{ top: (h - FIRST_HOUR) * 60 * PX_PER_MINUTE }} />
            ))}
            {clusterEvents(d.date, d.events).map((cluster) =>
              cluster.lanes > MAX_LANES ? (
                <BusyBlock key={cluster.items[0].event.id} cluster={cluster} />
              ) : (
                cluster.items.map(({ event, start, end, lane }) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    title={`${event.name} · ${event.foodDescription ?? ""}`}
                    className="absolute overflow-hidden rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-xs leading-tight text-emerald-950 hover:z-10 hover:bg-emerald-100"
                    style={{ ...verticalSpan(start, end), left: `calc(${(lane / cluster.lanes) * 100}% + 2px)`, width: `calc(${100 / cluster.lanes}% - 4px)` }}
                  >
                    <div className="font-semibold">{formatTimeRange(event.startsAt, event.endsAt, true)}</div>
                    <div className="font-medium">{event.name}</div>
                    {event.foodDescription && <div className="text-emerald-700 first-letter:uppercase">{event.foodDescription}</div>}
                  </Link>
                ))
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Many overlapping events: one block over their whole time span listing each by start time. */
function BusyBlock({ cluster }: { cluster: Cluster }) {
  return (
    <div
      className="absolute inset-x-0.5 flex flex-col gap-0.5 overflow-y-auto rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-1 text-xs leading-tight"
      style={verticalSpan(cluster.start, cluster.end)}
    >
      <div className="font-semibold text-emerald-800">{cluster.items.length} events</div>
      {cluster.items.map(({ event }) => (
        <Link key={event.id} href={`/events/${event.id}`} title={`${event.name} · ${event.foodDescription ?? ""}`} className="truncate rounded px-0.5 text-emerald-950 hover:bg-emerald-100">
          <span className="text-emerald-700">{formatTimeRange(event.startsAt, null, true)}</span> {event.name}
        </Link>
      ))}
    </div>
  );
}
