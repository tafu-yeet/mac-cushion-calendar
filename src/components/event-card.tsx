import Link from "next/link";

import type { PublicEvent } from "@/lib/events";
import { formatDay, formatTimeRange, toLocalInputs } from "@/lib/time";

import { CalendarPlusIcon, ClockIcon, ExternalIcon, PinIcon, UtensilsIcon } from "./icons";

// Plain props only, so the card works in both server and client components.
export function EventCard({ event, live = false, showDate = false }: { event: PublicEvent; live?: boolean; showDate?: boolean }) {
  const time = formatTimeRange(event.startsAt, event.endsAt, event.startTimeKnown);
  const date = formatDay(toLocalInputs(event.startsAt).date, "short");

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
        live ? "border-emerald-300 ring-1 ring-emerald-200" : "border-stone-200 hover:border-stone-300"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {live && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            On now
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
          <ClockIcon className="size-4 text-stone-400" />
          {showDate ? `${date} · ${time}` : time}
        </span>
      </div>

      <h3 className="mt-2 text-lg font-semibold leading-snug text-stone-900">
        <Link href={`/events/${event.id}`} className="hover:underline">
          {event.name}
        </Link>
      </h3>

      {event.foodDescription && (
        <p className="mt-1.5 flex items-start gap-1.5 font-medium text-emerald-700">
          <UtensilsIcon className="mt-0.5 size-4 shrink-0" />
          <span className="first-letter:uppercase">{event.foodDescription}</span>
        </p>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-sm text-stone-600">
        <PinIcon className="mt-0.5 size-4 shrink-0 text-stone-400" />
        {event.location ?? "Location not announced"}
      </p>

      <p className="mt-1 text-sm text-stone-500">
        {event.hostedBy ? (
          <>
            {event.hostedBy} <span className="text-stone-400">· shared by {event.clubName}</span>
          </>
        ) : (
          event.clubName
        )}
        {!event.openToAll && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Limited entry</span>}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`/events/${event.id}/calendar.ics`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          <CalendarPlusIcon className="size-4" />
          Add to calendar
        </a>
        {event.permalink && (
          <a
            href={event.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
          >
            Instagram post
            <ExternalIcon className="size-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}
