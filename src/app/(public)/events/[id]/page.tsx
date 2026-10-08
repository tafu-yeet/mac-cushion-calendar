import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CalendarPlusIcon, ChevronIcon, ClockIcon, ExternalIcon, PinIcon, UtensilsIcon } from "@/components/icons";
import { ShareButton } from "@/components/share-button";
import { getEvent, type PublicEvent } from "@/lib/events";
import { formatDay, formatTimeRange, toLocalInputs } from "@/lib/time";

function summary(e: PublicEvent): string {
  const when = `${formatDay(toLocalInputs(e.startsAt).date)}, ${formatTimeRange(e.startsAt, e.endsAt, e.startTimeKnown)}`;
  return [e.foodDescription && `Free ${e.foodDescription}`, when, e.location].filter(Boolean).join(" · ");
}

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(Number(id));
  if (!event) return { title: "Event not found" };
  const description = `${summary(event)}. Posted by ${event.clubName}.`;
  return {
    title: event.name,
    description,
    openGraph: { title: event.name, description, type: "website" },
  };
}

export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-stone-600 hover:text-stone-900">
        <ChevronIcon direction="left" className="size-4" />
        Today&apos;s free food
      </Link>
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-stone-200/70" aria-label="Loading" />}>
        {params.then(({ id }) => (
          <EventDetail id={Number(id)} />
        ))}
      </Suspense>
    </div>
  );
}

async function EventDetail({ id }: { id: number }) {
  const event = await getEvent(id);
  if (!event) notFound();
  const date = toLocalInputs(event.startsAt).date;

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-stone-500">
        {event.hostedBy ? (
          <>
            {event.hostedBy} <span className="text-stone-400">· shared by {event.clubName}</span>
          </>
        ) : (
          event.clubName
        )}
      </p>
      <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-stone-900">{event.name}</h1>

      {event.foodDescription && (
        <p className="mt-3 flex items-start gap-2 text-lg font-semibold text-emerald-700">
          <UtensilsIcon className="mt-1 size-5 shrink-0" />
          <span className="first-letter:uppercase">{event.foodDescription}</span>
        </p>
      )}

      <dl className="mt-5 space-y-3 text-stone-700">
        <div className="flex items-start gap-2">
          <dt className="sr-only">When</dt>
          <ClockIcon className="mt-0.5 size-5 shrink-0 text-stone-400" />
          <dd>
            <div className="font-medium text-stone-900">{formatDay(date)}</div>
            <div>{formatTimeRange(event.startsAt, event.endsAt, event.startTimeKnown)}</div>
          </dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="sr-only">Where</dt>
          <PinIcon className="mt-0.5 size-5 shrink-0 text-stone-400" />
          <dd>{event.location ?? "Location not announced. Check the club's post."}</dd>
        </div>
      </dl>

      {!event.openToAll && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Entry may be limited (members, sign-up, or a specific group). Check the post before you go.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
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
        <ShareButton title={event.name} text={summary(event)} />
      </div>
    </article>
  );
}
