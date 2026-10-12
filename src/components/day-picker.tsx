"use client";

import { PICKER_WEEKS } from "@/lib/filters";
import { addDays, dateParts, formatDay, mondayOf } from "@/lib/time";

/** Per day ("YYYY-MM-DD"): how many events you could go to, and how many have free food. */
export type DayCounts = Map<string, { events: number; food: number }>;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * "Which day are you free?": six weeks from this Monday, one button a day,
 * with a dot on days that have something (gold when there's free food).
 */
export function DayPicker({
  id,
  today,
  selected,
  counts,
  onPick,
  onClose,
}: {
  id: string;
  today: string;
  selected: string | null;
  counts: DayCounts;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const start = mondayOf(today);
  const days = Array.from({ length: PICKER_WEEKS * 7 }, (_, i) => addDays(start, i));

  return (
    <div id={id} className="rounded-[24px] bg-canvas p-3 sm:p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <p className="px-1 pb-2 font-display text-base font-semibold">Which day are you free?</p>
      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Pick a day">
        {WEEKDAYS.map((w) => (
          <span key={w} aria-hidden="true" className="pb-1 text-[11px] font-semibold text-maroon/80">
            {w}
          </span>
        ))}
        {days.map((date, i) => {
          const past = date < today;
          const count = counts.get(date);
          const isSelected = date === selected;
          const isToday = date === today;
          // The month over the first day shown and over each 1st.
          const month = i === 0 || date.endsWith("-01") ? dateParts(date).month : "";
          const summary = count
            ? `${count.events} event${count.events === 1 ? "" : "s"}${count.food ? `, ${count.food} with free food` : ""}`
            : "nothing announced yet";
          return (
            <button
              key={date}
              type="button"
              disabled={past}
              aria-pressed={isSelected}
              aria-label={`${formatDay(date, "long", today)}${isToday ? ", today" : ""}: ${summary}`}
              onClick={() => onPick(date)}
              className={`flex h-14 flex-col items-center justify-center rounded-2xl leading-none transition-colors ${
                isSelected
                  ? "bg-maroon text-cream"
                  : past
                    ? "text-maroon/35"
                    : `bg-panel text-maroon hover:bg-butter/70 ${isToday ? "ring-2 ring-maroon" : ""}`
              }`}
            >
              <span className="h-3 text-[9px] font-bold tracking-wider">{month}</span>
              <span className="font-display text-lg font-semibold">{Number(date.slice(8))}</span>
              <span className="flex h-2 items-center">
                {count && !past && (
                  <span className={`size-1.5 rounded-full ${count.food ? "bg-gold" : isSelected ? "bg-cream" : "bg-maroon/60"}`} />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-maroon/80">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-maroon/60" />
          Something on
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-gold" />
          Free food
        </span>
      </p>
    </div>
  );
}
