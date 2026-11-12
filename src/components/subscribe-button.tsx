"use client";

import { useEffect, useId, useRef, useState } from "react";

import { RepeatIcon } from "./icons";

/**
 * "Subscribe", then a choice of calendar app. Unlike "Add to calendar" (one event), this adds
 * the club's calendar feed (`feedUrl`, absolute): its new events then show up in the app on their own.
 */
export function SubscribeButton({ feedUrl, name, className }: { feedUrl: string; name: string; className: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const webcal = feedUrl.replace(/^https?:/, "webcal:");
  const choices = [
    {
      label: "Google Calendar",
      hint: "New events can take up to a day to appear",
      href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
      newTab: true,
    },
    {
      label: "Outlook",
      hint: "School or work email",
      href: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`,
      newTab: true,
    },
    // webcal:// hands the feed to the device's calendar app.
    { label: "Apple Calendar or other", hint: "iPhone, Mac and most calendar apps", href: webcal, newTab: false },
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this calendar link:", feedUrl);
    }
  };

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
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${className}`}
      >
        <RepeatIcon className="size-4" />
        Subscribe
      </button>
      {open && (
        <div id={menuId} className="absolute top-full left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-cream p-1.5 text-maroon shadow-lg ring-1 ring-maroon/15">
          <p className="px-3 pt-2 pb-1.5 text-xs text-maroon/80">Adds this club&apos;s calendar to yours: its new events show up on their own.</p>
          <ul>
            {choices.map((choice) => (
              <li key={choice.label}>
                <a
                  href={choice.href}
                  onClick={() => setOpen(false)}
                  {...(choice.newTab ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="flex min-h-11 flex-col justify-center rounded-xl px-3 py-1.5 hover:bg-butter/60"
                >
                  <span className="text-sm font-semibold">{choice.label}</span>
                  <span className="text-xs text-maroon/80">{choice.hint}</span>
                </a>
              </li>
            ))}
            <li>
              <button type="button" onClick={copy} className="flex min-h-11 w-full flex-col justify-center rounded-xl px-3 py-1.5 text-left hover:bg-butter/60">
                <span className="text-sm font-semibold" aria-live="polite">
                  {copied ? "Link copied" : "Copy the calendar link"}
                </span>
                <span className="text-xs text-maroon/80">For any app with &ldquo;subscribe&rdquo; or &ldquo;add by URL&rdquo;</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
