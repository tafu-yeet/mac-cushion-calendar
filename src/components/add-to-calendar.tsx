"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { CalendarPlusIcon } from "./icons";
import { useMember } from "./member-provider";
import { DrawnCheck, PulseRing, Swap, usePresence } from "./motion";

// After a calendar is picked, the button says "Added" this long. (The site can't tell whether the calendar app saved it.)
const ADDED_FOR_MS = 2000;

const CHOICES = [
  // Google Calendar can show a "sync error" when it isn't open yet; the second try works.
  { app: "google", label: "Google Calendar", hint: "Says “sync error” the first time? Open Google Calendar, then tap this again." },
  { app: "outlook", label: "Outlook", hint: "School or work email" },
  { app: "ics", label: "Apple Calendar or other", hint: "Opens a calendar file" },
] as const;

/**
 * "Add to calendar", then a choice of calendar: Google and Outlook open with the event filled in,
 * the rest get an .ics file. Members only: signed out, the tap goes to sign-in and back to the event.
 */
export function AddToCalendar({ eventId, className }: { eventId: number; className: string }) {
  const { member, ready } = useMember();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { shown: menuShown, closing } = usePresence(open || null);
  // Goes up with each calendar picked; `added` is whether the button says so right now.
  const [picks, setPicks] = useState(0);
  const [added, setAdded] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // A tap or click anywhere else closes the choices.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!added) return;
    const back = setTimeout(() => setAdded(false), ADDED_FOR_MS);
    return () => clearTimeout(back);
  }, [added, picks]);

  return (
    <div
      ref={wrapper}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        data-tap="calendar_menu"
        data-tap-event={eventId}
        onClick={() => {
          // Not known yet: open the choices, and the add link itself sends a signed-out visitor to sign in.
          if (ready && !member) router.push(`/sign-in?next=${encodeURIComponent(`/events/${eventId}`)}`);
          else setOpen(!open);
        }}
        className={`press relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${className}`}
      >
        <Swap
          on={added}
          off={
            <>
              <CalendarPlusIcon className="size-4" />
              Add to calendar
            </>
          }
        >
          <DrawnCheck drawn={picks} />
          Added
        </Swap>
        <PulseRing beat={added ? picks : 0} />
      </button>
      {menuShown && (
        <ul
          id={menuId}
          data-closing={closing || undefined}
          inert={closing}
          className="pop origin-top-left absolute top-full left-0 z-20 mt-2 w-64 rounded-2xl bg-cream p-1.5 text-maroon shadow-lg ring-1 ring-maroon/15"
        >
          {CHOICES.map((choice) => (
            <li key={choice.app}>
              <a
                href={choice.app === "ics" ? `/events/${eventId}/calendar.ics` : `/events/${eventId}/add/${choice.app}`}
                {...(choice.app === "ics" ? {} : { target: "_blank", rel: "noreferrer" })}
                data-calendar-add={eventId}
                onClick={() => {
                  setOpen(false);
                  setPicks((n) => n + 1);
                  setAdded(true);
                }}
                className="press flex flex-col rounded-xl px-3 py-2 hover:bg-butter/70"
              >
                <span className="text-sm font-semibold">{choice.label}</span>
                <span className="text-xs text-maroon/75">{choice.hint}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
