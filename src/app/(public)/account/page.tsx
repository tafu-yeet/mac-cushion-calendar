import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FollowButton } from "@/components/member-actions";
import { MemberSeed } from "@/components/member-provider";
import { ALERT, BUTTON_LIGHT, CARD, LINK_BUTTON, PAGE, TITLE } from "@/components/member-styles";
import { requireMember } from "@/lib/auth";
import { getClubs } from "@/lib/clubs";
import { activeBlocks, clockLabel, scheduleExpired, WEEKDAY_NAMES } from "@/lib/schedule";
import { formatDay, todayInCampus } from "@/lib/time";

import { signOut } from "../sign-in/actions";
import { deleteAccount } from "./actions";
import { EmailSettings, InterestSettings, NameSetting } from "./settings";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const H2 = "font-display text-xl font-semibold lowercase";

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <div className={PAGE}>
      <Suspense fallback={<div className="h-96 skeleton rounded-[28px]" />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Account({ searchParams }: { searchParams: PageProps<"/account">["searchParams"] }) {
  const [member, params, clubs] = await Promise.all([requireMember("/account"), searchParams, getClubs()]);
  const today = todayInCampus();
  const followed = clubs.filter((c) => member.follows.includes(c.id));
  const blocks = activeBlocks(member.busy, today);
  const until = blocks.reduce((max, b) => (b.termEndsOn > max ? b.termEndsOn : max), "");

  return (
    <MemberSeed member={member}>
      <div>
        <h1 className={TITLE}>your account</h1>
        <p className="mt-1 text-sm text-maroon/80">{member.email}</p>
        {member.memberNumber !== null && (
          <p className="mt-2 inline-flex rounded-full bg-gold px-3 py-1 text-sm font-semibold">
            {member.founding ? `Founding member #${member.memberNumber}` : `Member #${member.memberNumber}`}
          </p>
        )}
      </div>

      {params.delete === "failed" && <p className={ALERT}>We couldn&apos;t delete your account. Try again, or email us.</p>}
      {params.delete === "confirm" && <p className={ALERT}>Tick the box to confirm, then tap Delete.</p>}

      <section className={CARD} aria-labelledby="emails">
        <h2 id="emails" className={H2}>
          emails
        </h2>
        <EmailSettings emails={member.emails} />
      </section>

      <section className={CARD} aria-labelledby="interests">
        <h2 id="interests" className={H2}>
          what you&apos;re into
        </h2>
        <p className="text-sm text-maroon/80">These go first in your feed, and in Sunday picks.</p>
        <InterestSettings interests={member.interests} />
      </section>

      <section className={CARD} aria-labelledby="clubs">
        <h2 id="clubs" className={H2}>
          clubs you follow
        </h2>
        {followed.length ? (
          <ul className="flex flex-col gap-2">
            {followed.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <Link href={`/clubs/${c.username}`} className="min-w-0 truncate font-semibold underline-offset-2 hover:underline">
                  {c.name}
                </Link>
                <FollowButton clubId={c.id} clubName={c.name} className="ring-1 ring-maroon/30" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            None yet. Tap <span className="font-semibold">Follow</span> on any event or{" "}
            <Link href="/clubs" className="font-semibold underline underline-offset-2">
              club page
            </Link>
            .
          </p>
        )}
      </section>

      <section className={CARD} aria-labelledby="schedule">
        <h2 id="schedule" className={H2}>
          your class schedule
        </h2>
        {blocks.length ? (
          <>
            <p className="text-sm">
              {blocks.length} weekly class block{blocks.length === 1 ? "" : "s"}, until {formatDay(until, "long", today)}. &ldquo;Fits
              my schedule&rdquo; hides events that clash with them.
            </p>
            <ul className="text-sm text-maroon/85">
              {blocks.slice(0, 4).map((b) => (
                <li key={`${b.weekday}-${b.start}`}>
                  {WEEKDAY_NAMES[b.weekday - 1]} {clockLabel(b.start)}–{clockLabel(b.end)}
                </li>
              ))}
              {blocks.length > 4 && <li>and {blocks.length - 4} more</li>}
            </ul>
          </>
        ) : (
          <p className="text-sm">
            {scheduleExpired(member.busy, today)
              ? "Your schedule ended with the term. Add the new one to use “Fits my schedule” again."
              : "Add your classes and “Fits my schedule” hides events you can't make."}
          </p>
        )}
        <Link href="/account/schedule" className={BUTTON_LIGHT}>
          {blocks.length ? "Change schedule" : "Add your schedule"}
        </Link>
      </section>

      <section className={CARD} aria-labelledby="you">
        <h2 id="you" className={H2}>
          you
        </h2>
        <NameSetting name={member.name} />
        <div className="flex flex-wrap gap-x-5">
          <Link href="/account/password" className={LINK_BUTTON}>
            Set a password
          </Link>
          <Link href="/privacy" className={LINK_BUTTON}>
            What we keep
          </Link>
        </div>
        <form action={signOut}>
          <button type="submit" className={`${BUTTON_LIGHT} w-full`}>
            Sign out
          </button>
        </form>
      </section>

      <details className="rounded-[28px] px-5 py-3 ring-1 ring-maroon/15">
        <summary className="cursor-pointer py-1 text-sm font-semibold">Delete my account</summary>
        <form action={deleteAccount} className="mt-3 flex flex-col gap-3 pb-2">
          <p className="text-sm">
            This deletes your account and everything in it: follows, interests, schedule, reminders and email choices. It can&apos;t be
            undone. Browsing the calendar stays open to you.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" className="mt-0.5 size-5 accent-red-700" />
            Yes, delete my account and everything in it
          </label>
          <button type="submit" className="press min-h-12 rounded-full bg-red-700 px-5 text-base font-semibold text-white hover:bg-red-800">
            Delete my account
          </button>
        </form>
      </details>
    </MemberSeed>
  );
}
