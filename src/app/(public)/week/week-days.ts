import type { PublicEvent } from "@/lib/events";
import { addDays, formatDay, toLocalInputs } from "@/lib/time";

import type { WeekDay } from "./types";

/** The seven days from `monday`, each with its events. */
export function weekDays(monday: string, today: string, events: PublicEvent[]): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return {
      date,
      weekday: formatDay(date, "short").split(",")[0],
      dayOfMonth: Number(date.slice(8)),
      label: formatDay(date, "long", today),
      isToday: date === today,
      events: events.filter((e) => toLocalInputs(e.startsAt).date === date),
    };
  });
}
