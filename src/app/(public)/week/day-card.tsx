import Link from "next/link";

import { hasRegistrationBadge, HeadsUpBadge, RegistrationBadge } from "@/components/event-card";
import { ChevronIcon, PinIcon, UtensilsIcon } from "@/components/icons";
import { categoryOf, dayTone, type Tone } from "@/lib/categories";
import { freeFoodPhrase } from "@/lib/clean";
import type { PublicEvent } from "@/lib/events";
import { dateParts, formatTime, minutesIntoDay, otherYear } from "@/lib/time";

import type { WeekDay } from "./types";

// On a phone a day lists this many events, then links to the rest on its day view.
const PHONE_LIMIT = 6;

type Column = { label: string; events: PublicEvent[] };

const hourLabel = (hour: number) => (hour === 0 || hour === 24 ? "12 am" : hour === 12 ? "12 pm" : hour > 12 ? `${hour - 12} pm` : `${hour} am`);

/** The day's on-campus events grouped under the hour they start, then the ones with no time yet, then off campus. */
function hourColumns(onCampus: PublicEvent[], offCampus: PublicEvent[]): Column[] {
  const byHour = new Map<number, PublicEvent[]>();
  for (const e of onCampus.filter((e) => e.startTimeKnown)) {
    const hour = Math.floor(minutesIntoDay(e.startsAt) / 60);
    byHour.set(hour, [...(byHour.get(hour) ?? []), e]);
  }
  const columns: Column[] = [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, list]) => ({ label: hourLabel(hour), events: list }));
  const untimed = onCampus.filter((e) => !e.startTimeKnown);
  if (untimed.length) columns.push({ label: "Time TBD", events: untimed });
  if (offCampus.length) columns.push({ label: "Off campus", events: offCampus });
  return columns;
}

/** A price short enough for a chip: "$10" or "$5–$15" from "Free for members, $10 cash for non-members". */
function shortPrice(price: string | null): string {
  const amounts = [...(price ?? "").matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
  if (!amounts.length) return price && price.length <= 12 ? price : "Paid";
  const [low, high] = [Math.min(...amounts), Math.max(...amounts)];
  const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

/** Cancelled or postponed, free food, price, and RSVP or drop in, as small badges. */
function Badges({ event, tone, size }: { event: PublicEvent; tone: Tone; size: "chip" | "row" }) {
  const off = event.scheduleStatus !== "scheduled";
  if (!off && !event.headsUp && !event.hasFreeFood && event.cost !== "paid" && !hasRegistrationBadge(event)) return null;
  const text = size === "chip" ? "text-[10px]" : "text-[11px]";
  return (
    <span className={`flex flex-wrap gap-1 ${size === "chip" ? "pl-3" : ""}`}>
      {off && (
        <span className={`rounded-full px-1.5 py-px font-bold uppercase ${text} ${event.scheduleStatus === "cancelled" ? "bg-red-600 text-white" : "bg-amber-300 text-amber-950"}`}>
          {event.scheduleStatus === "cancelled" ? "Cancelled" : "Postponed"}
        </span>
      )}
      <HeadsUpBadge event={event} size="xs" />
      {event.hasFreeFood && (
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-bold ${text} ${tone.chipBadge}`}
          title={freeFoodPhrase(event.foodDescription)}
        >
          <UtensilsIcon className="size-2.5" />
          Free food
        </span>
      )}
      {event.cost === "paid" && (
        <span className={`rounded-full px-1.5 py-px font-bold ring-1 ring-current/50 ${text}`} title={event.price ?? undefined}>
          {shortPrice(event.price)}
        </span>
      )}
      <RegistrationBadge event={event} className={`px-1.5 py-px ${text}`} />
    </span>
  );
}

/** Events still on: cancelled ones are listed, marked, but not counted. */
const liveCount = (events: PublicEvent[]) => events.filter((e) => e.scheduleStatus !== "cancelled").length;

const struck = (e: PublicEvent) => (e.scheduleStatus === "cancelled" ? "line-through" : "");

/** One day of the week view: a list on phones, the big date and hour columns on wider screens. */
export function DayCard({ day, dayHref, today }: { day: WeekDay; dayHref: string; today: string }) {
  const tone = dayTone(day.date);
  const onCampus = day.events.filter((e) => !e.offCampus);
  const offCampus = day.events.filter((e) => e.offCampus);
  const ring = day.isToday ? "ring-2 ring-maroon ring-offset-2 ring-offset-canvas" : "";

  return (
    <article className={`rounded-[28px] p-4 sm:p-5 ${tone.card} ${ring}`}>
      <PhoneDay day={day} dayHref={dayHref} today={today} tone={tone} onCampus={onCampus} offCampus={offCampus} />
      <WideDay day={day} dayHref={dayHref} today={today} tone={tone} columns={hourColumns(onCampus, offCampus)} />
    </article>
  );
}

type DayProps = { day: WeekDay; dayHref: string; today: string; tone: Tone };

/** Phones: a one-line header, then the events as a list with their start times; the rest on the day view. */
function PhoneDay({ day, dayHref, today, tone, onCampus, offCampus }: DayProps & { onCampus: PublicEvent[]; offCampus: PublicEvent[] }) {
  const { weekday, day: dayOfMonth, month } = dateParts(day.date);
  const count = liveCount(day.events);
  const shownOn = onCampus.slice(0, PHONE_LIMIT);
  const shownOff = offCampus.slice(0, Math.max(PHONE_LIMIT - shownOn.length, Math.min(offCampus.length, 2)));
  const hidden = day.events.length - shownOn.length - shownOff.length;

  return (
    <div className="sm:hidden">
      <Link href={dayHref} className="group flex items-end justify-between gap-3" aria-label={`${day.label}: open the day`}>
        <span>
          <span className="block text-sm font-medium">
            {weekday}
            {otherYear(day.date, today) && ` ${day.date.slice(0, 4)}`}
            {day.isToday && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.chip}`}>Today</span>
            )}
          </span>
          <span className="font-display text-3xl font-semibold leading-tight group-hover:underline">
            {Number(dayOfMonth)} {month}
          </span>
        </span>
        <span className="inline-flex items-center gap-0.5 pb-1 text-sm font-medium opacity-90">
          {count ? `${count} event${count === 1 ? "" : "s"}` : "Nothing yet"}
          {count > 0 && <ChevronIcon className="size-4" />}
        </span>
      </Link>

      {shownOn.length > 0 && <EventList events={shownOn} tone={tone} />}
      {shownOff.length > 0 && (
        <>
          <p className="mt-4 flex items-center gap-1 text-xs font-bold uppercase tracking-wider opacity-90">
            <PinIcon className="size-3.5" />
            Off campus
          </p>
          <EventList events={shownOff} tone={tone} />
        </>
      )}
      {hidden > 0 && (
        <Link href={dayHref} className="mt-3 inline-flex items-center gap-0.5 text-sm font-semibold underline-offset-2 hover:underline">
          +{hidden} more on {weekday}
          <ChevronIcon className="size-4" />
        </Link>
      )}
    </div>
  );
}

function EventList({ events, tone }: { events: PublicEvent[]; tone: Tone }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {events.map((e) => (
        <li key={e.id}>
          <Link href={`/events/${e.id}`} className={`flex gap-3 rounded-2xl px-3 py-2 hover:opacity-90 ${tone.chip}`}>
            <span className="w-16 shrink-0 pt-px text-xs font-bold tabular-nums">
              {e.startTimeKnown ? formatTime(e.startsAt) : "Time TBD"}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-start gap-1.5 text-sm font-semibold leading-snug">
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${categoryOf(e.category).tone.swatch}`} />
                <span className={`line-clamp-2 ${struck(e)}`}>{e.name}</span>
              </span>
              <Badges event={e} tone={tone} size="row" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Wider screens: the big date on the left, the events as chips in hour columns. */
function WideDay({ day, dayHref, today, tone, columns }: DayProps & { columns: Column[] }) {
  const { weekday, day: dayOfMonth, month } = dateParts(day.date);
  const count = liveCount(day.events);
  return (
    <div className="hidden gap-6 sm:flex">
      <Link href={dayHref} className="group w-28 shrink-0" aria-label={`${day.label}: open the day`}>
        <p className="text-sm font-medium">
          {weekday}
          {otherYear(day.date, today) && ` ${day.date.slice(0, 4)}`}
        </p>
        <p className="mt-1.5 font-display text-6xl font-semibold leading-[0.85] tracking-[-0.02em] group-hover:underline">
          {dayOfMonth}
          <br />
          {month}
        </p>
        {day.isToday && (
          <span className={`mt-3 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.chip}`}>
            Today
          </span>
        )}
        <p className={`text-xs opacity-90 ${day.isToday ? "mt-1.5" : "mt-3"}`}>{count ? `${count} event${count === 1 ? "" : "s"}` : "Nothing yet"}</p>
      </Link>

      {columns.length ? (
        // Hour columns wrap, four to a row, so no event is hidden off to the side.
        <div className="min-w-0 flex-1">
          <div className="flex h-full flex-wrap gap-y-3">
            {columns.map((column) => (
              <div key={column.label} className={`flex w-1/4 min-w-0 flex-col gap-1.5 border-l px-2 pb-1 ${tone.line}`}>
                <p className="flex items-center gap-1 text-[11px] font-semibold opacity-90">
                  {column.label === "Off campus" && <PinIcon className="size-3" />}
                  {column.label}
                </p>
                {column.events.map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className={`flex flex-col gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold leading-tight hover:opacity-90 ${tone.chip}`}
                  >
                    <span className="flex items-start gap-1.5">
                      <span className={`mt-[3px] size-1.5 shrink-0 rounded-full ${categoryOf(e.category).tone.swatch}`} />
                      <span className="line-clamp-2">
                        {column.label === "Off campus" && e.startTimeKnown && <span className="opacity-90">{formatTime(e.startsAt)} · </span>}
                        <span className={struck(e)}>{e.name}</span>
                      </span>
                    </span>
                    <Badges event={e} tone={tone} size="chip" />
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="self-center text-sm opacity-90">Nothing announced yet.</p>
      )}
    </div>
  );
}
