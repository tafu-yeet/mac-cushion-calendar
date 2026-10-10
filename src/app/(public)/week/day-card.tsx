import Link from "next/link";

import { UtensilsIcon } from "@/components/icons";
import { categoryOf, dayTone } from "@/lib/categories";
import { freeFoodPhrase } from "@/lib/clean";
import type { PublicEvent } from "@/lib/events";
import { dateParts, minutesIntoDay, otherYear } from "@/lib/time";

import type { WeekDay } from "./types";

type Column = { label: string; events: PublicEvent[] };

const hourLabel = (hour: number) => (hour === 0 || hour === 24 ? "12 am" : hour === 12 ? "12 pm" : hour > 12 ? `${hour - 12} pm` : `${hour} am`);

/** The day's events grouped under the hour they start, then the ones with no time yet. */
function hourColumns(events: PublicEvent[]): Column[] {
  const byHour = new Map<number, PublicEvent[]>();
  for (const e of events.filter((e) => e.startTimeKnown)) {
    const hour = Math.floor(minutesIntoDay(e.startsAt) / 60);
    byHour.set(hour, [...(byHour.get(hour) ?? []), e]);
  }
  const columns: Column[] = [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, list]) => ({ label: hourLabel(hour), events: list }));
  const untimed = events.filter((e) => !e.startTimeKnown);
  if (untimed.length) columns.push({ label: "Time TBD", events: untimed });
  return columns;
}

/** One day of the week view: the big date on a pastel card, its events as chips on a mini timeline. */
export function DayCard({ day, dayHref, today }: { day: WeekDay; dayHref: string; today: string }) {
  const tone = dayTone(day.date);
  const { weekday, day: dayOfMonth, month } = dateParts(day.date);
  const columns = hourColumns(day.events);
  const count = day.events.length;

  return (
    <article
      className={`flex gap-4 rounded-[28px] p-4 sm:gap-6 sm:p-5 ${tone.card} ${
        day.isToday ? "ring-2 ring-maroon ring-offset-2 ring-offset-canvas" : ""
      }`}
    >
      <Link href={dayHref} className="group w-[5.25rem] shrink-0 sm:w-28" aria-label={`${day.label}: open the day`}>
        <p className="text-sm font-medium">
          {weekday}
          {otherYear(day.date, today) && ` ${day.date.slice(0, 4)}`}
        </p>
        <p className="mt-1.5 font-display text-[2.75rem] font-semibold leading-[0.85] tracking-[-0.02em] group-hover:underline sm:text-6xl">
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
        // Hour columns wrap, two to a row on phones and four on wider screens, so no event is hidden off to the side.
        <div className="min-w-0 flex-1">
          <div className="flex h-full flex-wrap gap-y-3">
            {columns.map((column) => (
              <div key={column.label} className={`flex w-1/2 min-w-0 flex-col gap-1.5 border-l px-2 pb-1 sm:w-1/4 ${tone.line}`}>
                <p className="text-[11px] font-semibold opacity-90">{column.label}</p>
                {column.events.map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    className={`flex flex-col gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold leading-tight hover:opacity-90 ${tone.chip}`}
                  >
                    <span className="flex items-start gap-1.5">
                      <span className={`mt-[3px] size-1.5 shrink-0 rounded-full ${categoryOf(e.category).tone.swatch}`} />
                      <span className="line-clamp-2">{e.name}</span>
                    </span>
                    {(e.hasFreeFood || e.cost === "paid") && (
                      <span className="flex flex-wrap gap-1 pl-3">
                        {e.hasFreeFood && (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold ${tone.chipBadge}`}
                            title={freeFoodPhrase(e.foodDescription)}
                          >
                            <UtensilsIcon className="size-2.5" />
                            Free food
                          </span>
                        )}
                        {e.cost === "paid" && (
                          <span className="rounded-full px-1.5 py-px text-[10px] font-bold ring-1 ring-current/50">{e.price ?? "Paid"}</span>
                        )}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="self-center text-sm opacity-90">Nothing announced yet.</p>
      )}
    </article>
  );
}
