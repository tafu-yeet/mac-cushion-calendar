"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CalendarPlusIcon } from "./icons";

const CHOICES = [
  { app: "google", label: "Google Calendar", hint: "Opens Google Calendar" },
  { app: "outlook", label: "Outlook", hint: "School or work email" },
  { app: "ics", label: "Apple Calendar or other", hint: "Opens a calendar file" },
] as const;

/** "Add to calendar", then a choice of calendar: Google and Outlook open with the event filled in, the rest get an .ics file. */
export function AddToCalendar({ eventId, className }: { eventId: number; className: string }) {
  const [open, setOpen] = useState(false);
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
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${className}`}
      >
        <CalendarPlusIcon className="size-4" />
        Add to calendar
      </button>
      {open && (
        <ul id={menuId} className="absolute top-full left-0 z-20 mt-2 w-60 rounded-2xl bg-cream p-1.5 text-maroon shadow-lg ring-1 ring-maroon/15">
          {CHOICES.map((choice) => (
            <li key={choice.app}>
              <a
                href={choice.app === "ics" ? `/events/${eventId}/calendar.ics` : `/events/${eventId}/add/${choice.app}`}
                {...(choice.app === "ics" ? {} : { target: "_blank", rel: "noreferrer" })}
                onClick={() => setOpen(false)}
                className="flex flex-col rounded-xl px-3 py-2 hover:bg-butter/70"
              >
                <span className="text-sm font-semibold">{choice.label}</span>
                <span className="text-xs text-maroon/70">{choice.hint}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
