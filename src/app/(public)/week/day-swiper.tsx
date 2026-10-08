"use client";

import { useEffect, useRef, useState } from "react";

import { EventCard } from "@/components/event-card";

import type { WeekDay } from "./types";

/** Phones: one day per screen, swiped sideways, opening on today. */
export function DaySwiper({ days }: { days: WeekDay[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(() => Math.max(days.findIndex((d) => d.isToday), 0));

  const show = (index: number, smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? "smooth" : "instant" });
  };

  useEffect(() => {
    show(current, false);
    // Only on first render: open on today without animating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Days of the week">
        {days.map((d, i) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={i === current}
            onClick={() => {
              setCurrent(i);
              show(i);
            }}
            className={`flex flex-col items-center rounded-xl py-1.5 text-xs ${
              i === current ? "bg-stone-900 text-white" : d.isToday ? "bg-emerald-50 text-emerald-800" : "text-stone-600"
            }`}
          >
            <span className="font-medium">{d.weekday}</span>
            <span className="text-base font-semibold">{d.dayOfMonth}</span>
            <span className={`mt-0.5 size-1.5 rounded-full ${d.events.length ? (i === current ? "bg-white" : "bg-emerald-500") : "bg-transparent"}`} />
          </button>
        ))}
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          const index = Math.round(el.scrollLeft / el.clientWidth);
          if (index !== current) setCurrent(index);
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d) => (
          <section key={d.date} className="flex w-full shrink-0 snap-start flex-col gap-3 px-0.5" aria-label={d.label}>
            <h2 className="text-sm font-semibold text-stone-700">
              {d.label}
              {d.isToday && <span className="ml-2 text-emerald-700">Today</span>}
            </h2>
            {d.events.length ? (
              d.events.map((e) => <EventCard key={e.id} event={e} />)
            ) : (
              <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">
                No free food announced for this day yet.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
