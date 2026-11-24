"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { followAfterSignIn } from "@/app/(public)/account/actions";

import { CloseIcon } from "./icons";
import { useMember } from "./member-provider";

// One nudge per browser session, for signed-out visitors, right after they show interest: an
// Instagram tap ("Follow this club") or a calendar add ("we'll remind you"). It sits at the
// bottom of the screen, never covers what they were doing, and goes away when dismissed.

const SHOWN = "mcc_prompted";

type Prompt = { kind: "follow"; clubId: number; clubName: string } | { kind: "remind"; eventId: number };

function alreadyShown(): boolean {
  try {
    return sessionStorage.getItem(SHOWN) === "1";
  } catch {
    return true; // no session storage: it could show on every page, so don't show it at all
  }
}

/** Reads the URL (to close on a new page), so render it inside <Suspense>. */
export function IntentPrompts() {
  const { member, ready } = useMember();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [pending, start] = useTransition();
  const signedOut = ready && !member;
  // A new page closes it (adjusted while rendering, not in an effect).
  const path = usePathname();
  const [shownOn, setShownOn] = useState(path);
  if (shownOn !== path) {
    setShownOn(path);
    setPrompt(null);
  }

  useEffect(() => {
    if (!signedOut) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || alreadyShown()) return;
      const club = e.target.closest<HTMLElement>("a[data-club-id]");
      const calendar = e.target.closest<HTMLElement>("a[data-calendar-add]");
      let next: Prompt | null = null;
      if (club?.dataset.clubId) next = { kind: "follow", clubId: Number(club.dataset.clubId), clubName: club.dataset.clubName ?? "this club" };
      else if (calendar?.dataset.calendarAdd) next = { kind: "remind", eventId: Number(calendar.dataset.calendarAdd) };
      if (!next) return;
      try {
        sessionStorage.setItem(SHOWN, "1");
      } catch {
        return;
      }
      // After the tap's own work (a new tab, a calendar file), so it's there when they come back.
      setTimeout(() => setPrompt(next), 400);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [signedOut]);

  if (!prompt || !signedOut) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-[24px] bg-plum p-4 text-cream shadow-xl motion-safe:animate-[rise_200ms_ease-out]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm leading-snug font-semibold">
          {prompt.kind === "follow"
            ? `Follow ${prompt.clubName} to get pinged next time they post.`
            : "Make an account and we'll remind you before it starts."}
        </p>
        <div className="flex flex-wrap gap-2">
          {prompt.kind === "follow" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => followAfterSignIn(prompt.clubId, window.location.pathname + window.location.search))}
              className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-maroon hover:bg-butter disabled:opacity-60"
            >
              Follow
            </button>
          ) : (
            <Link
              href={`/sign-in?next=${encodeURIComponent(`/events/${prompt.eventId}`)}`}
              onClick={() => setPrompt(null)}
              className="rounded-full bg-gold px-4 py-2 text-sm font-semibold text-maroon hover:bg-butter"
            >
              Make an account
            </Link>
          )}
          <button type="button" onClick={() => setPrompt(null)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-cream/40">
            Not now
          </button>
        </div>
      </div>
      <button type="button" onClick={() => setPrompt(null)} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-cream/15">
        <CloseIcon className="size-4" />
      </button>
    </div>
  );
}
