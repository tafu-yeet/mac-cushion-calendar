import Link from "next/link";

import { UtensilsIcon } from "@/components/icons";
import { categoryOf, dayTone } from "@/lib/categories";
import type { PublicEvent } from "@/lib/events";
import { dateParts, minutesIntoDay } from "@/lib/time";

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
export function DayCard({ day, dayHref }: { day: WeekDay; dayHref: string }) {
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
        <p className="text-sm font-medium">{weekday}</p>
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
        <p className={`text-xs opacity-70 ${day.isToday ? "mt-1.5" : "mt-3"}`}>{count ? `${count} event${count === 1 ? "" : "s"}` : "Nothing yet"}</p>
      </Link>

      {columns.length ? (
        <div
          className={`min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            // On phones only two columns fit: fade the edge so it reads as "scroll for more".
            columns.length > 2 ? "max-sm:[mask-image:linear-gradient(to_right,black_80%,transparent)]" : ""
          }`}
        >
          <div className="flex h-full min-w-max">
            {columns.map((column) => (
              <div key={column.label} className={`flex w-[7.25rem] flex-col gap-1.5 border-l px-2 pb-1 sm:w-36 ${tone.line}`}>
                <p className="text-[11px] font-medium opacity-70">{column.label}</p>
                {column.events.map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    title={[e.name, e.foodDescription && `Free ${e.foodDescription}`].filter(Boolean).join(" · ")}
                    className={`flex items-start gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold leading-tight hover:opacity-90 ${tone.chip}`}
                  >
                    <span className={`mt-[3px] size-1.5 shrink-0 rounded-full ${categoryOf(e.category).tone.swatch}`} />
                    <span className="line-clamp-2">{e.name}</span>
                    {e.hasFreeFood && <UtensilsIcon className="mt-px size-3 shrink-0" />}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="self-center text-sm opacity-60">Nothing announced yet.</p>
      )}
    </article>
  );
}
