"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { followAfterSignIn, setFollow, setReminder } from "@/app/(public)/account/actions";
import { REMINDER_LEAD_MINUTES } from "@/lib/email/select";
import { REMINDERS_CONSENT_WORDING } from "@/lib/auth-links";

import { BellIcon, PlusIcon } from "./icons";
import { updateMember, useMember } from "./member-provider";
import { DrawnCheck, PulseRing, Swap, usePresence } from "./motion";

const PILL = "press relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold disabled:opacity-60";

/**
 * "Follow" a club, or "Following" once you do. Signed out, it goes to sign-in and follows the
 * club once you're in. `className` styles the button when not following (the card's colours).
 */
export function FollowButton({ clubId, clubName, className }: { clubId: number; clubName: string; className: string }) {
  const { member } = useMember();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  // Goes up each time they follow: the check draws itself and the button gives one pulse.
  const [followed, setFollowed] = useState(0);
  const following = !!member?.follows.includes(clubId);

  const toggle = () => {
    if (!member) {
      // Back to this page after signing in. Read on the tap, so cards can prerender.
      start(() => followAfterSignIn(clubId, window.location.pathname + window.location.search));
      return;
    }
    const want = !following;
    if (want) setFollowed((n) => n + 1);
    updateMember((m) => ({ ...m, follows: want ? [...m.follows, clubId] : m.follows.filter((id) => id !== clubId) }));
    setError(false);
    start(async () => {
      const saved = await setFollow(clubId, want);
      if (saved.ok) return;
      updateMember((m) => ({ ...m, follows: want ? m.follows.filter((id) => id !== clubId) : [...m.follows, clubId] }));
      setError(true);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending && !member}
      aria-pressed={member ? following : undefined}
      title={error ? "That didn't save. Try again." : following ? `Stop following ${clubName}` : `Follow ${clubName}: their events in your feed and emails`}
      className={`${PILL} ${following ? "bg-current/15" : className}`}
    >
      <Swap
        on={following}
        off={
          <>
            <PlusIcon className="size-4" />
            Follow
          </>
        }
      >
        <DrawnCheck drawn={followed} />
        Following
      </Swap>
      <span className="sr-only"> {clubName}</span>
      <PulseRing beat={following ? followed : 0} />
    </button>
  );
}

/**
 * "Remind me": an email an hour before. Members only, for events far enough off to remind about.
 * The first time, it says what it'll send and asks, since that turns reminder emails on.
 */
export function RemindButton({ eventId, startsAt, timeKnown, now, className }: { eventId: number; startsAt: string; timeKnown: boolean; now: number; className: string }) {
  const { member } = useMember();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const { shown: askShown, closing } = usePresence(asking || null);
  const [error, setError] = useState(false);
  const [reminded, setReminded] = useState(0); // goes up each time a reminder is set: the check draws itself
  const box = useRef<HTMLDivElement>(null);
  const askId = useId();

  useEffect(() => {
    if (!asking) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setAsking(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [asking]);

  if (!member || !timeKnown || Date.parse(startsAt) - now <= REMINDER_LEAD_MINUTES * 60_000) return null;
  const on = member.reminders.includes(eventId);

  const save = (want: boolean) => {
    setAsking(false);
    setError(false);
    if (want) setReminded((n) => n + 1);
    updateMember((m) => ({
      ...m,
      reminders: want ? [...m.reminders, eventId] : m.reminders.filter((id) => id !== eventId),
      emails: want ? { ...m.emails, reminders: true } : m.emails,
    }));
    start(async () => {
      const saved = await setReminder(eventId, want);
      if (saved.ok) return;
      updateMember((m) => ({ ...m, reminders: want ? m.reminders.filter((id) => id !== eventId) : [...m.reminders, eventId] }));
      setError(true);
    });
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => (on ? save(false) : member.emails.reminders ? save(true) : setAsking((a) => !a))}
        aria-pressed={on}
        aria-expanded={asking || undefined}
        aria-controls={asking ? askId : undefined}
        disabled={pending}
        title={error ? "That didn't save. Try again." : on ? "We'll email you an hour before. Tap to cancel." : "Get an email an hour before"}
        className={`${PILL} ${on ? "bg-current/15" : className}`}
      >
        <Swap
          on={on}
          off={
            <>
              <BellIcon className="size-4" />
              Remind me
            </>
          }
        >
          <DrawnCheck drawn={reminded} />
          Reminder set
        </Swap>
        <PulseRing beat={on ? reminded : 0} />
      </button>
      {askShown && (
        <div
          id={askId}
          data-closing={closing || undefined}
          inert={closing}
          className="pop origin-bottom-left absolute bottom-full left-0 z-20 mb-2 flex w-72 flex-col gap-3 rounded-2xl bg-cream p-4 text-maroon shadow-lg ring-1 ring-maroon/15"
        >
          <p className="text-sm leading-snug">{REMINDERS_CONSENT_WORDING}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => save(true)} className="press rounded-full bg-maroon px-4 py-2 text-sm font-semibold text-cream hover:bg-plum">
              Email me
            </button>
            <button type="button" onClick={() => setAsking(false)} className="press rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-maroon/25">
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
