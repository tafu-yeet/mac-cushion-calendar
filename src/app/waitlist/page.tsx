import type { Metadata } from "next";
import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";

import { UtensilsIcon } from "@/components/icons";
import { campus } from "@/lib/campus";
import { freeFoodPhrase } from "@/lib/clean";
import { getEventsBetween, type PublicEvent } from "@/lib/events";
import { endMs } from "@/lib/status";
import { addDays, dateParts, dayStartIso, formatTime, toLocalInputs, todayInCampus } from "@/lib/time";
import { getClubCount, getWaitlistCount, SHOW_COUNT_FROM } from "@/lib/waitlist";

import { WaitlistForm } from "./waitlist-form";

// A sign-up page for Instagram (story, posts, bio): ?from=story etc. records
// which link brought each person. It stands alone, without the site's menu.

const DESCRIPTION = `Every public ${campus.schoolShortName} event in one place, free food included. Join the waitlist and be first in when it launches.`;

export const metadata: Metadata = {
  title: "Join the waitlist",
  description: DESCRIPTION,
  openGraph: { title: `${campus.siteName}: join the waitlist`, description: DESCRIPTION, siteName: campus.siteName, type: "website" },
};

const PEEK_COUNT = 3;

const STEPS = [
  { title: "we read the posts", text: "Every club's Instagram, checked through the day, so you don't have to follow hundreds of pages." },
  { title: "we double-check", text: "AI reads each flyer, then a second check confirms the date, the time, and whether the food's really free." },
  { title: "you pick a time", text: "Free from 2 to 4? See everything on in that window, from free pizza to pickup soccer." },
];

export default function WaitlistPage() {
  return (
    <div className="flex flex-1 flex-col bg-canvas font-body text-maroon">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-7 px-4 pt-4 pb-10 sm:gap-8 sm:pt-10">
        <header className="flex items-center gap-2.5">
          <Image src="/logo-mark.png" alt="" width={36} height={36} className="size-9 rounded-full" priority />
          <span className="font-display text-lg font-semibold leading-none lowercase">{campus.siteName}</span>
        </header>

        <section className="flex flex-col gap-3 sm:gap-4">
          <span className="self-start rounded-full bg-maroon px-3 py-1 text-xs font-bold tracking-wider text-gold uppercase">
            Launching soon
          </span>
          <h1 className="font-display text-[3.25rem] font-semibold leading-[0.88] tracking-[-0.03em] lowercase min-[400px]:text-[3.75rem] sm:text-7xl">
            never miss free food at {campus.schoolNickname} again
          </h1>
          <Suspense fallback={<Pitch clubs={null} />}>
            <PitchWithClubs />
          </Suspense>
        </section>

        <section aria-label="Join the waitlist" className="rounded-[32px] bg-maroon p-6 text-cream shadow-sm sm:p-8">
          <WaitlistForm />
          <Suspense fallback={null}>
            <JoinedCount />
          </Suspense>
        </section>

        <Suspense fallback={null}>
          <ThisWeek />
        </Suspense>

        <section className="flex flex-col gap-3">
          <h2 className="px-1 font-display text-xl font-semibold lowercase">how it works</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-[28px] bg-panel p-5">
                <span className="grid size-8 place-items-center rounded-full bg-maroon font-display font-semibold text-cream">{i + 1}</span>
                <p className="mt-3 font-display text-lg font-semibold lowercase">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-maroon/80">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="flex flex-col gap-2 px-1">
          <a
            href={`https://www.instagram.com/${campus.instagram}/`}
            target="_blank"
            rel="noreferrer"
            className="self-start text-sm font-semibold underline underline-offset-2 hover:text-plum"
          >
            Follow @{campus.instagram}
          </a>
          <p className="text-xs text-maroon/70">A student project, not affiliated with {campus.school}.</p>
        </footer>
      </main>
    </div>
  );
}

async function PitchWithClubs() {
  return <Pitch clubs={await getClubCount()} />;
}

function Pitch({ clubs }: { clubs: number | null }) {
  return (
    <p className="leading-relaxed text-maroon/85 sm:text-lg">
      We read {clubs ? `${clubs}+` : "hundreds of"} {campus.schoolShortName} club Instagram pages and put every event in
      one place: free food, socials, sports, and more.
    </p>
  );
}

/** "84 people are already on the list", once there are enough to look like a crowd. */
async function JoinedCount() {
  const count = await getWaitlistCount();
  if (count < SHOW_COUNT_FROM) return null;
  return (
    <p className="mt-5 flex items-center gap-2 border-t border-cream/20 pt-4 text-sm font-semibold">
      <span className="size-2 rounded-full bg-gold" />
      {count.toLocaleString("en-US")} people are already on the list
    </p>
  );
}

/** The next 7 days' public events that haven't ended. Reads the clock, so it runs per request. */
async function loadWeek() {
  await connection();
  const now = Date.now();
  const today = todayInCampus();
  const events = await getEventsBetween(dayStartIso(today), dayStartIso(addDays(today, 7)));
  return { today, events: events.filter((e) => e.openToAll && (!e.startTimeKnown || endMs(e) > now)) };
}

/** Real numbers from the coming week, and a few free-food events, to show it's not vapourware. */
async function ThisWeek() {
  const { today, events } = await loadWeek();
  if (!events.length) return null;
  const withFood = events.filter((e) => e.hasFreeFood);
  const timed = (list: PublicEvent[]) => list.filter((e) => e.startTimeKnown && !e.offCampus);
  const peek = (withFood.length ? timed(withFood) : timed(events)).slice(0, PEEK_COUNT);

  return (
    <section className="flex flex-col gap-4 rounded-[32px] bg-panel p-5 shadow-sm sm:p-6">
      <h2 className="font-display text-xl font-semibold lowercase">the next 7 days at {campus.schoolNickname}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat value={events.length} label={`event${events.length === 1 ? "" : "s"}`} className="bg-canvas" />
        <Stat value={withFood.length} label="with free food" className="bg-gold" />
      </div>
      {peek.length > 0 && (
        <>
          <p className="px-1 text-sm font-semibold text-maroon/80">A few coming up</p>
          <ul className="flex flex-col gap-2">
            {peek.map((e) => (
              <li key={e.id} className="flex gap-3 rounded-2xl bg-canvas px-4 py-3">
                <p className="w-[4.5rem] shrink-0 pt-0.5 text-xs font-bold leading-snug">
                  {dayLabel(toLocalInputs(e.startsAt).date, today)}
                  <br />
                  {formatTime(e.startsAt)}
                </p>
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <p className="line-clamp-2 font-semibold leading-snug">{e.name}</p>
                  <p className="text-xs text-maroon/75">{e.clubName}</p>
                  {e.hasFreeFood && (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold">
                      <UtensilsIcon className="size-3 shrink-0" />
                      <span className="truncate">{freeFoodPhrase(e.foodDescription)}</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={`rounded-[24px] px-4 py-4 ${className}`}>
      <p className="font-display text-5xl font-semibold leading-none tracking-[-0.02em]">{value}</p>
      <p className="mt-1.5 text-sm font-medium">{label}</p>
    </div>
  );
}

/** "Today", "Tomorrow", or the weekday. */
function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return dateParts(date).weekday;
}
