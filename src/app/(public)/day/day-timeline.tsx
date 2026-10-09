import Link from "next/link";

import { UtensilsIcon } from "@/components/icons";
import { categoryOf } from "@/lib/categories";
import type { PublicEvent } from "@/lib/events";
import { formatTime, formatTimeRange, minutesIntoDay, toLocalInputs } from "@/lib/time";

const PX_PER_MINUTE = 1.1;
const DEFAULT_MINUTES = 60; // when an event has no end time
const MIN_MINUTES = 30; // so short events stay readable
// More side-by-side events than this get too narrow to read, so they become one list block.
const MAX_LANES = 2;
const DAY_END = 24 * 60;
const EARLIEST_SHOWN_HOUR = 8; // the timeline starts here, or earlier if something does
const ROOM_FOR_DETAILS_PX = 80; // shorter blocks show the name, time and food, but not the place

type Placed = { event: PublicEvent; start: number; end: number; lane: number };
type Cluster = { start: number; end: number; lanes: number; items: Placed[] };

/** Runs of overlapping events, each event given a side-by-side lane. */
function clusterEvents(day: string, events: PublicEvent[]): Cluster[] {
  const items = events
    .filter((e) => e.startTimeKnown)
    .map((e) => {
      const start = minutesIntoDay(e.startsAt);
      let end = e.endsAt ? minutesIntoDay(e.endsAt) : start + DEFAULT_MINUTES;
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

const hourLabel = (hour: number) => (hour === 0 ? "12 am" : hour === 12 ? "12 pm" : hour > 12 ? `${hour - 12} pm` : `${hour} am`);

/** One day's timed events on an hour scale, with a line at the current time when `nowMinutes` is given. */
export function DayTimeline({ date, events, nowMinutes }: { date: string; events: PublicEvent[]; nowMinutes: number | null }) {
  const clusters = clusterEvents(date, events);
  const firstHour = Math.min(EARLIEST_SHOWN_HOUR, Math.floor((clusters[0]?.start ?? DAY_END) / 60));
  const origin = firstHour * 60;
  const y = (minutes: number) => (minutes - origin) * PX_PER_MINUTE;
  const span = (start: number, end: number) => ({ top: y(start), height: Math.max(y(end) - y(start), MIN_MINUTES * PX_PER_MINUTE) - 3 });
  const hours = Array.from({ length: 24 - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <div className="relative" style={{ height: y(DAY_END) }}>
      {hours.map((hour) => (
        <div key={hour} className="absolute inset-x-0 flex items-center gap-3" style={{ top: y(hour * 60) }}>
          <span className="w-11 shrink-0 -translate-y-px text-right text-[11px] font-semibold text-maroon/45">
            {hour < 24 ? hourLabel(hour) : ""}
          </span>
          <span className="h-px flex-1 bg-maroon/10" />
        </div>
      ))}

      <div className="absolute inset-y-0 left-14 right-0">
        {clusters.map((cluster) =>
          cluster.lanes > MAX_LANES ? (
            <BusyBlock key={cluster.items[0].event.id} cluster={cluster} style={span(cluster.start, cluster.end)} />
          ) : (
            cluster.items.map(({ event, start, end, lane }) => (
              <EventBlock
                key={event.id}
                event={event}
                style={{
                  ...span(start, end),
                  left: `calc(${(lane / cluster.lanes) * 100}% + 2px)`,
                  width: `calc(${100 / cluster.lanes}% - 4px)`,
                }}
              />
            ))
          ),
        )}

        {nowMinutes !== null && nowMinutes >= origin && (
          <div className="pointer-events-none absolute inset-x-0 z-0 flex items-center" style={{ top: y(nowMinutes) }} aria-label="Now">
            <span className="-ml-1.5 size-3 rounded-full border-2 border-panel bg-maroon" />
            <span className="h-0.5 flex-1 bg-maroon" />
          </div>
        )}
      </div>
    </div>
  );
}

function EventBlock({ event, style }: { event: PublicEvent; style: React.CSSProperties & { height: number } }) {
  const tone = categoryOf(event.category).tone;
  const roomy = style.height >= ROOM_FOR_DETAILS_PX;
  return (
    <Link
      href={`/events/${event.id}`}
      title={[event.name, event.foodDescription && `Free ${event.foodDescription}`].filter(Boolean).join(" · ")}
      className={`absolute z-10 flex flex-col gap-1 overflow-hidden rounded-2xl px-3 py-2 text-xs leading-tight transition-shadow hover:z-20 hover:shadow-md ${tone.card}`}
      style={style}
    >
      <span className="font-display text-sm font-semibold leading-tight">{event.name}</span>
      <span className="opacity-75">{formatTimeRange(event.startsAt, event.endsAt, true)}</span>
      {event.hasFreeFood && (
        <span className={`inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 font-semibold ${tone.accent}`}>
          <UtensilsIcon className="size-3 shrink-0" />
          <span className="line-clamp-1 first-letter:uppercase">{event.foodDescription ?? "Free food"}</span>
        </span>
      )}
      {roomy && event.location && <span className="line-clamp-1 opacity-75">{event.location}</span>}
    </Link>
  );
}

/** Many overlapping events: one block over their whole span, listing each by start time. */
function BusyBlock({ cluster, style }: { cluster: Cluster; style: React.CSSProperties }) {
  return (
    <div
      className="absolute inset-x-0.5 z-10 flex flex-col gap-1 overflow-y-auto rounded-2xl bg-canvas p-2.5 text-xs leading-tight ring-1 ring-maroon/20"
      style={style}
    >
      <p className="px-1 font-display font-semibold">{cluster.items.length} events at once</p>
      {cluster.items.map(({ event }) => (
        <Link
          key={event.id}
          href={`/events/${event.id}`}
          className={`flex items-center gap-2 rounded-xl px-2 py-1.5 hover:opacity-90 ${categoryOf(event.category).tone.card}`}
        >
          <span className="shrink-0 font-medium opacity-75">{formatTime(event.startsAt)}</span>
          <span className="truncate font-semibold">{event.name}</span>
          {event.hasFreeFood && <UtensilsIcon className="ml-auto size-3 shrink-0" />}
        </Link>
      ))}
    </div>
  );
}
