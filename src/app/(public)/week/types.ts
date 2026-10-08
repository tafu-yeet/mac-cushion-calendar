import type { PublicEvent } from "@/lib/events";

export type WeekDay = {
  date: string; // campus-local "YYYY-MM-DD"
  weekday: string; // "Mon"
  dayOfMonth: number;
  label: string; // "Monday, October 5"
  isToday: boolean;
  events: PublicEvent[];
};
