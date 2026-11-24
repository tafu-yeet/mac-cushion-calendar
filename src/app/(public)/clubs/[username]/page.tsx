import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { clubInitials, EventCard } from "@/components/event-card";
import { ChevronIcon, ExternalIcon, InstagramIcon } from "@/components/icons";
import { FollowButton } from "@/components/member-actions";
import { MembersOnly } from "@/components/members-only";
import { SubscribeButton } from "@/components/subscribe-button";
import { campus } from "@/lib/campus";
import { CLUB_PAST_DAYS, getClub } from "@/lib/clubs";
import { communityOf, type Community } from "@/lib/communities";
import { getClubEvents, type PublicEvent } from "@/lib/events";
import { byStart, groupByDay } from "@/lib/filters";
import { getMember } from "@/lib/member";
import { SITE_URL } from "@/lib/site-url";
import { endMs } from "@/lib/status";
import { addDays, dayStartIso, formatDay, toLocalInputs, todayInCampus } from "@/lib/time";

import { MissingEventLink } from "../../feedback";

export async function generateMetadata({ params }: PageProps<"/clubs/[username]">): Promise<Metadata> {
  const { username } = await params;
  const club = await getClub(username);
  if (!club) return { title: "Club not found" };
  const description = `What ${club.name} has coming up at ${campus.schoolShortName}, from its Instagram posts. Subscribe to get its events in your calendar.`;
  return {
    title: club.name,
    description,
    alternates: { canonical: `/clubs/${club.username}` },
    openGraph: { title: club.name, description, type: "website" },
  };
}

export default function ClubPage({ params }: PageProps<"/clubs/[username]">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/clubs"
        className="mb-4 inline-flex min-h-9 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-maroon/30 hover:bg-panel/60"
      >
        <ChevronIcon direction="left" className="size-4" />
        All clubs
      </Link>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-[32px] bg-maroon/10" role="status" aria-label="Loading" />}>
        {params.then(({ username }) => (
          <ClubDetail username={username} />
        ))}
      </Suspense>
    </div>
  );
}

/** The club and its events from the last month on, with the time it is now. Reads the clock. */
async function load(username: string) {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const club = await getClub(username);
  const events = club ? await getClubEvents(club.id, dayStartIso(addDays(today, -CLUB_PAST_DAYS))) : [];
  return { now, today, club, events };
}

async function ClubDetail({ username }: { username: string }) {
  const [{ now, today, club, events }, member] = await Promise.all([load(username), getMember()]);
  if (!club) notFound();

  // Over: ended, or on an earlier day when it had no start time.
  const over = (e: PublicEvent) => (e.startTimeKnown ? endMs(e) <= now : toLocalInputs(e.startsAt).date < today);
  const upcoming = events.filter((e) => !over(e)).sort(byStart);
  const recent = events.filter((e) => over(e) && e.scheduleStatus !== "cancelled").length;
  const communities = club.communities.map(communityOf).filter((c): c is Community => c !== null);
  const coming = upcoming.filter((e) => e.scheduleStatus !== "cancelled").length;

  if (!member) {
    return (
      <MembersOnly
        next={`/clubs/${club.username}`}
        heading={club.name}
        detail={coming ? `${coming} event${coming === 1 ? "" : "s"} coming up` : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[32px] bg-panel p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-4">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-full bg-maroon font-display text-lg font-semibold text-cream"
            aria-hidden="true"
          >
            {clubInitials(club.name)}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold leading-[1.05] [overflow-wrap:anywhere] sm:text-4xl">{club.name}</h1>
            <p className="mt-1 text-sm text-maroon/80">@{club.username}</p>
          </div>
        </div>

        <p className="mt-4 text-sm text-maroon/85">
          {coming ? `${coming} event${coming === 1 ? "" : "s"} coming up` : "Nothing coming up yet"}
          {" · "}
          {recent ? `${recent} in the last ${CLUB_PAST_DAYS} days` : `none in the last ${CLUB_PAST_DAYS} days`}
        </p>
        {!club.active && (
          <p className="mt-2 text-sm text-maroon/85">We&apos;ve stopped following this account, so its new posts won&apos;t show up here.</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {club.active && (
            <SubscribeButton
              feedUrl={`${SITE_URL}/clubs/${club.username}/calendar.ics`}
              name={club.name}
              className="bg-maroon text-cream hover:bg-plum"
            />
          )}
          <FollowButton clubId={club.id} clubName={club.name} className="min-h-10 bg-gold px-4 text-maroon hover:bg-butter" />
          <a
            href={`https://www.instagram.com/${club.username}/`}
            data-club-id={club.id}
            data-club-name={club.name}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-maroon ring-1 ring-maroon/30 hover:bg-canvas"
          >
            <InstagramIcon className="size-4" />
            Instagram
            <ExternalIcon className="size-3.5" />
            <span className="sr-only">(opens @{club.username})</span>
          </a>
        </div>

        {communities.length > 0 && (
          <div className="mt-5">
            <h2 className="mb-2 text-xs font-bold tracking-wider text-maroon/80 uppercase">Communities</h2>
            <div className="flex flex-wrap gap-2">
              {communities.map((c) => (
                <Link
                  key={c.key}
                  href={`/communities?c=${c.key}`}
                  className="rounded-full bg-canvas px-3 py-1 text-sm font-medium text-maroon ring-1 ring-maroon/20 hover:bg-butter/70"
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="coming-up">
        <h2 id="coming-up" className="px-1 font-display text-xl font-semibold lowercase">
          coming up
        </h2>
        {upcoming.length === 0 && (
          <p className="rounded-[28px] bg-canvas px-5 py-6 text-center text-sm text-maroon/75">
            Nothing announced yet. Clubs usually post a few days ahead.
            {club.active && " Subscribe, and its next events show up in your calendar on their own."}
          </p>
        )}
        {groupByDay(upcoming).map(([date, list]) => (
          <div key={date} className="flex flex-col gap-3">
            <h3 className="mt-2 px-1 font-display text-base font-semibold">
              {formatDay(date, "long", today)}
              {date === today && <span className="ml-2 text-maroon/75">Today</span>}
            </h3>
            {list.map((e) => (
              <EventCard key={e.id} event={e} now={now} />
            ))}
          </div>
        ))}
        <MissingEventLink />
      </section>
    </div>
  );
}
