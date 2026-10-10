import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { clubInitials } from "@/components/event-card";
import { CalendarPlusIcon, ChevronIcon, ExternalIcon, PinIcon, TicketIcon, UtensilsIcon } from "@/components/icons";
import { ShareButton } from "@/components/share-button";
import { categoryOf } from "@/lib/categories";
import { freeFoodPhrase } from "@/lib/clean";
import { getEvent, type PublicEvent } from "@/lib/events";
import { formatDay, formatDuration, formatTime, formatTimeRange, toLocalInputs, todayInCampus } from "@/lib/time";

/** "Free pizza · Friday, October 9, 6:00 PM · MUSC 230", for share text and link previews. */
function summary(e: PublicEvent, today: string): string {
  const when = `${formatDay(toLocalInputs(e.startsAt).date, "long", today)}, ${formatTimeRange(e.startsAt, e.endsAt, e.startTimeKnown)}`;
  const what = e.hasFreeFood ? freeFoodPhrase(e.foodDescription) : categoryOf(e.category).label;
  return [what, when, e.location].filter(Boolean).join(" · ");
}

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(Number(id));
  if (!event) return { title: "Event not found" };
  await connection(); // the summary reads the clock, for the year
  const description = `${summary(event, todayInCampus())}. Posted by ${event.clubName}.`;
  return {
    title: event.name,
    description,
    openGraph: { title: event.name, description, type: "website" },
  };
}

export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-maroon/30 hover:bg-panel/60">
        <ChevronIcon direction="left" className="size-4" />
        What&apos;s on
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[32px] bg-maroon/10" aria-label="Loading" />}>
        {params.then(({ id }) => (
          <EventDetail id={Number(id)} />
        ))}
      </Suspense>
    </div>
  );
}

async function EventDetail({ id }: { id: number }) {
  await connection(); // reads the clock, for the year
  const today = todayInCampus();
  const event = await getEvent(id);
  if (!event) notFound();
  const category = categoryOf(event.category);
  const date = toLocalInputs(event.startsAt).date;
  const duration = event.startTimeKnown ? formatDuration(event.startsAt, event.endsAt) : null;
  const host = event.hostedBy ?? event.clubName;

  return (
    <article className={`rounded-[32px] p-6 sm:p-8 ${category.tone.card}`}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium opacity-90">{category.label}</p>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-current/15 font-display text-sm font-semibold" title={host} aria-hidden="true">
          {clubInitials(host)}
        </span>
      </div>
      <h1 className="-mt-4 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl">{event.name}</h1>
      <p className="mt-3 opacity-90">
        {event.hostedBy ? (
          <>
            {event.hostedBy} · shared by {event.clubName}
          </>
        ) : (
          event.clubName
        )}
      </p>

      {(event.hasFreeFood || event.cost === "paid") && (
        <div className="mt-5 flex flex-wrap gap-2 font-medium">
          {event.hasFreeFood && (
            <span className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 ${category.tone.accent}`}>
              <UtensilsIcon className="size-5 shrink-0" />
              <span className="first-letter:uppercase">{event.foodDescription ?? "Free food"}</span>
            </span>
          )}
          {event.cost === "paid" && (
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 ring-1 ring-current/30">
              <TicketIcon className="size-5 shrink-0" />
              {event.price ?? "Paid entry: check the post for the price"}
            </span>
          )}
        </div>
      )}

      <div className="mt-8">
        <p className="text-sm font-medium opacity-90">{formatDay(date, "long", today)}</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-4xl font-medium leading-none whitespace-nowrap sm:text-5xl">
              {event.startTimeKnown ? formatTime(event.startsAt) : "Time TBD"}
            </p>
            <p className="mt-1.5 text-xs opacity-90">Start</p>
          </div>
          {duration && <span className={`mb-6 rounded-full px-3 py-1 text-xs font-medium ${category.tone.chip}`}>{duration}</span>}
          {event.startTimeKnown && event.endsAt && (
            <div className="text-right">
              <p className="font-display text-4xl font-medium leading-none whitespace-nowrap sm:text-5xl">{formatTime(event.endsAt)}</p>
              <p className="mt-1.5 text-xs opacity-90">End</p>
            </div>
          )}
        </div>
      </div>

      <p className={`mt-6 flex items-start gap-2 border-t pt-5 ${category.tone.line}`}>
        <PinIcon className="mt-0.5 size-5 shrink-0 opacity-90" />
        {event.location ?? "Location not announced. Check the club's post."}
      </p>

      {!event.openToAll && (
        <p className="mt-4 rounded-2xl bg-current/10 px-4 py-2.5 text-sm">
          Members or group only: this event is for a club&apos;s members or one program. Check the post to see if you can go.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href={`/events/${event.id}/calendar.ics`}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold ${category.tone.button}`}
        >
          <CalendarPlusIcon className="size-4" />
          Add to calendar
        </a>
        {event.permalink && (
          <a
            href={event.permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-current/30 hover:bg-current/10"
          >
            Instagram post
            <ExternalIcon className="size-3.5" />
          </a>
        )}
        <ShareButton title={event.name} text={summary(event, today)} />
      </div>
    </article>
  );
}
