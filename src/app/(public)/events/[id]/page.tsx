import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { clubInitials, RegistrationBadge, ScheduleBadge } from "@/components/event-card";
import { AddToCalendar } from "@/components/add-to-calendar";
import { ChevronIcon, ExternalIcon, PinIcon, TicketIcon, UtensilsIcon } from "@/components/icons";
import { ShareButton } from "@/components/share-button";
import { categoryOf } from "@/lib/categories";
import { freeFoodPhrase } from "@/lib/clean";
import { getEvent, type PublicEvent } from "@/lib/events";
import { formatDay, formatDuration, formatTime, formatTimeRange, timeAgo, toLocalInputs, todayInCampus } from "@/lib/time";

import { CancelledReport, FeedbackLink } from "../../feedback";

/** "Free pizza · Friday, October 9, 6:00 PM · MUSC 230", for share text and link previews. */
function summary(e: PublicEvent, today: string): string {
  const when = `${formatDay(toLocalInputs(e.startsAt).date, "long", today)}, ${formatTimeRange(e.startsAt, e.endsAt, e.startTimeKnown)}`;
  const what = e.hasFreeFood ? freeFoodPhrase(e.foodDescription) : categoryOf(e.category).label;
  const off = e.scheduleStatus === "cancelled" ? "CANCELLED" : e.scheduleStatus === "postponed" ? "POSTPONED" : null;
  return [off, what, when, e.location].filter(Boolean).join(" · ");
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

  const cancelled = event.scheduleStatus === "cancelled";

  return (
    <article className={`rounded-[32px] p-6 sm:p-8 ${category.tone.card}`}>
      <div className="flex items-start justify-between gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <ScheduleBadge status={event.scheduleStatus} size="lg" />
          <span className="opacity-90">{category.label}</span>
        </p>
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-current/15 font-display text-sm font-semibold" title={host} aria-hidden="true">
          {clubInitials(host)}
        </span>
      </div>
      <h1 className={`-mt-4 font-display text-4xl font-semibold leading-[1.05] sm:text-5xl ${cancelled ? "line-through decoration-[3px]" : ""}`}>
        {event.name}
      </h1>
      <p className="mt-3 opacity-90">
        {event.hostedBy ? (
          <>
            {event.hostedBy} · shared by {event.clubName}
          </>
        ) : (
          event.clubName
        )}
      </p>

      {event.scheduleStatus !== "scheduled" && (
        <p className={`mt-5 rounded-2xl px-4 py-3 font-semibold ${cancelled ? "bg-red-600 text-white" : "bg-amber-300 text-amber-950"}`}>
          {cancelled
            ? "The club cancelled this event."
            : "The club postponed this event. Check their post for a new date."}
        </p>
      )}

      {(event.hasFreeFood || event.cost === "paid" || event.registration === "drop_in") && (
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
          {event.registration === "drop_in" && <RegistrationBadge event={event} className="px-4 py-1.5" />}
        </div>
      )}

      <div className="mt-8">
        <p className="text-sm font-medium opacity-90">{formatDay(date, "long", today)}</p>
        <div className="mt-2 flex items-end justify-between gap-2 min-[400px]:gap-3">
          <div>
            <p className="font-display text-[2rem] font-medium leading-none whitespace-nowrap min-[400px]:text-4xl sm:text-5xl">
              {event.startTimeKnown ? formatTime(event.startsAt) : "Time TBD"}
            </p>
            <p className="mt-1.5 text-xs opacity-90">Start</p>
          </div>
          {duration && <span className={`mb-6 rounded-full px-3 py-1 text-xs font-medium ${category.tone.chip}`}>{duration}</span>}
          {event.startTimeKnown && event.endsAt && (
            <div className="text-right">
              <p className="font-display text-[2rem] font-medium leading-none whitespace-nowrap min-[400px]:text-4xl sm:text-5xl">{formatTime(event.endsAt)}</p>
              <p className="mt-1.5 text-xs opacity-90">End</p>
            </div>
          )}
        </div>
      </div>

      <p className={`mt-6 flex items-start gap-2 border-t pt-5 ${category.tone.line}`}>
        <PinIcon className="mt-0.5 size-5 shrink-0 opacity-90" />
        {event.location ?? "Location not announced. Check the club's post."}
      </p>

      <Registration event={event} buttonClass={category.tone.button} />

      {!event.openToAll && (
        <p className="mt-4 rounded-2xl bg-current/10 px-4 py-2.5 text-sm">
          Members or group only: this event is for a club&apos;s members or one program. Check the post to see if you can go.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {!cancelled && <AddToCalendar eventId={event.id} className={category.tone.button} />}
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
        {event.rubricUrl && !(event.registrationWhere === "rubric" && event.registration !== "drop_in" && event.registration !== "unknown") && (
          <a
            href={event.rubricUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-current/30 hover:bg-current/10"
          >
            {event.cost === "paid" || (event.registration === "required" && event.registrationWhere === "rubric") ? "Tickets on Rubric" : "Rubric listing"}
            <ExternalIcon className="size-3.5" />
          </a>
        )}
        <ShareButton title={event.name} text={summary(event, today)} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <FeedbackLink
          type="wrong_info"
          event={{ id: event.id, name: event.name }}
          className="text-sm font-medium underline underline-offset-2 opacity-90 hover:opacity-100"
        >
          Something wrong with this event?
        </FeedbackLink>
        {!cancelled && (
          <CancelledReport eventId={event.id} className="text-sm font-medium underline underline-offset-2 opacity-90 hover:opacity-100" />
        )}
      </div>
      {event.checkedAt && <p className="mt-3 text-xs opacity-80">Last checked: {timeAgo(event.checkedAt, checkedNow())}</p>}
    </article>
  );
}

/** The time "Last checked" counts from; this page renders per request (connection() above). */
const checkedNow = () => Date.now();

// Where to register, as "Registration required: on Rubric", and the button that goes there.
const WHERE = {
  rubric: { label: "on Rubric", button: "Register on Rubric" },
  link_in_bio: { label: "through the link in the club's Instagram bio", button: "Open their Instagram" },
  form: { label: "with a sign-up form", button: "Open the form" },
  qr_code: { label: "with the QR code on the poster", button: "See the poster" },
  at_the_door: { label: "at the door", button: null },
  other: { label: "see the club's post for how", button: "See how" },
} as const;

function registrationLink(event: PublicEvent): string | null {
  switch (event.registrationWhere) {
    case "rubric":
      return event.registrationUrl ?? event.rubricUrl;
    case "link_in_bio":
      return event.clubUsername ? `https://www.instagram.com/${event.clubUsername}/` : null;
    case "at_the_door":
      return null;
    case "qr_code":
      return event.permalink;
    default:
      return event.registrationUrl ?? event.permalink;
  }
}

/** Required: "Registration required: [where]" with a button. Recommended: a lighter note. Otherwise nothing. */
function Registration({ event, buttonClass }: { event: PublicEvent; buttonClass: string }) {
  if (event.registration !== "required" && event.registration !== "recommended") return null;
  const where = event.registrationWhere ? WHERE[event.registrationWhere] : { label: "check the club's post for how", button: "See the post" };
  const href = event.registrationWhere ? registrationLink(event) : event.permalink;

  if (event.registration === "recommended") {
    return (
      <p className="mt-4 text-sm opacity-90">
        RSVP appreciated
        {event.registrationWhere && event.registrationWhere !== "other" ? ` ${where.label}` : ""}
        {href && (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
              RSVP
            </a>
          </>
        )}
      </p>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-current/10 px-4 py-3">
      <p className="text-sm">
        <span className="font-bold">Registration required:</span> {where.label}
      </p>
      {href && where.button && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${buttonClass}`}
        >
          {where.button}
          <ExternalIcon className="size-3.5" />
        </a>
      )}
    </div>
  );
}
