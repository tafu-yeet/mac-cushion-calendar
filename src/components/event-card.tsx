import Link from "next/link";

import { categoryOf } from "@/lib/categories";
import type { PublicEvent } from "@/lib/events";
import { eventStatus, startsInLabel } from "@/lib/status";
import { campusDate, formatDay, formatDuration, formatTime, toLocalInputs } from "@/lib/time";

import { CalendarPlusIcon, ExternalIcon, PinIcon, TicketIcon, UtensilsIcon } from "./icons";

// Words that don't help tell clubs apart in their initials.
const NAME_FILLER = new Set(["mcmaster", "mac", "the", "of", "and", "at", "for", "university", "&"]);

/** "ML" for "McMaster Linguistics Society": a stand-in for the club's avatar. */
export function clubInitials(name: string): string {
  const words = name.split(/[\s@()\-]+/).filter((w) => w && !NAME_FILLER.has(w.toLowerCase()));
  return (words.length ? words : [name]).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

/** "On now" or "Starts in 25 min" from the current time; nothing otherwise (the start time says it). */
export function StatusBadge({ event, now, className }: { event: PublicEvent; now: number; className: string }) {
  const status = eventStatus(event, now);
  if (status.kind === "live") {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${className}`}>
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        On now
      </span>
    );
  }
  if (status.kind === "soon") {
    return <span className={`rounded-full px-2 py-0.5 font-semibold ${className}`}>{startsInLabel(status.minutes)}</span>;
  }
  return null;
}

/**
 * A card in the event's category colour: big title, then the start, how long
 * it runs, and the end. `now` drives the "On now" / "Starts in" badge.
 */
export function EventCard({ event, now, showDate = false }: { event: PublicEvent; now: number; showDate?: boolean }) {
  const category = categoryOf(event.category);
  const duration = event.startTimeKnown ? formatDuration(event.startsAt, event.endsAt) : null;
  const date = formatDay(toLocalInputs(event.startsAt).date, "short", campusDate(now));
  const host = event.hostedBy ?? event.clubName;

  return (
    <article className={`rounded-[28px] p-5 ${category.tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
            <StatusBadge event={event} now={now} className={category.tone.accent} />
            <span className="opacity-90">{category.label}</span>
          </p>
          <h3 className="mt-1.5 font-display text-2xl font-semibold leading-[1.1]">
            <Link href={`/events/${event.id}`} className="hover:underline">
              {event.name}
            </Link>
          </h3>
        </div>
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-current/15 font-display text-xs font-semibold"
          title={host}
          aria-hidden="true"
        >
          {clubInitials(host)}
        </span>
      </div>

      <p className="mt-1 text-sm opacity-90">
        {event.hostedBy ? (
          <>
            {event.hostedBy} · shared by {event.clubName}
          </>
        ) : (
          event.clubName
        )}
      </p>

      {(event.hasFreeFood || event.cost === "paid" || !event.openToAll) && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-medium">
          {event.hasFreeFood && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${category.tone.accent}`}>
              <UtensilsIcon className="size-4 shrink-0" />
              <span className="first-letter:uppercase">{event.foodDescription ?? "Free food"}</span>
            </span>
          )}
          {event.cost === "paid" && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-current/40">
              <TicketIcon className="size-4 shrink-0" />
              {event.price ?? "Paid entry"}
            </span>
          )}
          {!event.openToAll && <span className="rounded-full px-3 py-1 ring-1 ring-current/40">Members or group only</span>}
        </div>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-sm opacity-90">
        <PinIcon className="mt-0.5 size-4 shrink-0" />
        {event.location ?? "Location not announced"}
      </p>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[1.65rem] font-medium leading-none whitespace-nowrap">
            {event.startTimeKnown ? formatTime(event.startsAt) : "Time TBD"}
          </p>
          <p className="mt-1 text-xs opacity-90">{showDate ? `${date} · Start` : "Start"}</p>
        </div>
        {duration && <span className={`mb-4 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${category.tone.chip}`}>{duration}</span>}
        {event.startTimeKnown && event.endsAt && (
          <div className="text-right">
            <p className="font-display text-[1.65rem] font-medium leading-none whitespace-nowrap">{formatTime(event.endsAt)}</p>
            <p className="mt-1 text-xs opacity-90">End</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={`/events/${event.id}/calendar.ics`}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${category.tone.button}`}
        >
          <CalendarPlusIcon className="size-4" />
          Add to calendar
        </a>
        {event.permalink && (
          <a
            href={event.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-current/40 hover:bg-current/10"
          >
            Instagram
            <ExternalIcon className="size-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}
