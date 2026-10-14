"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { campus } from "@/lib/campus";

// Remembered in this browser only, like the filters in the URL: nothing is sent anywhere.
const SEEN_KEY = "cushion-tour-seen";
const START_EVENT = "cushion:start-tour";
const START_DELAY_MS = 700; // let a first-time visitor see the page before the tour covers it
const GAP = 14; // between the highlighted element and the card
const GUTTER = 16; // the card's least distance from the screen's edges
const PAD = 6; // the highlight's margin around the element
const HEADER_ROOM = 76; // the sticky header's height, and a little more
const CARD_ROOM = 230; // what the card needs below the element

type Step = { target?: string; title: string; body: string };

// Targets are CSS selectors; a step whose target isn't on the page (no events today) is skipped.
const STEPS: Step[] = [
  {
    title: "welcome to cushion",
    body: `Every public ${campus.schoolShortName} event in one place, read from clubs' Instagram posts, so you don't have to scroll through hundreds of accounts. Here's a quick look around.`,
  },
  { target: '[data-tour="search"]', title: "search anything", body: "A club, a building, a kind of food, or just “karaoke”." },
  {
    target: '[data-tour="day"]',
    title: "pick the day you're free",
    body: "Today, tomorrow, the next 7 days, or any date on the calendar. Days with free food get a gold dot.",
  },
  {
    target: '[data-tour="time"]',
    title: "when are you free?",
    body: "Morning, afternoon, evening, or your own window. You'll only see what you could drop into.",
  },
  { target: '[data-tour="food"]', title: "free food, one tap", body: "Shows only the events with free food." },
  {
    target: '[data-tour="type"]',
    title: "narrow it down",
    body: "Socials, sports, arts, talks and more. Under More: free entry, and events for members only.",
  },
  {
    target: '[data-tour="events"] article',
    title: "every event",
    body: "When and where, what food there is, and what it costs. Add it to your calendar, or open the club's post to check before you go.",
  },
  { target: '[data-tour="calendar"]', title: "the whole week", body: "The calendar lays out every day at a glance." },
];

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private windows can refuse storage; the tour may then show again next visit.
  }
}

const visible = (selector: string) => {
  const el = document.querySelector(selector);
  return !!el && el.getClientRects().length > 0;
};

/** "Take the tour" for the footer: starts it on the home page, or opens the home page with it. */
export function TourButton({ className }: { className?: string }) {
  const router = useRouter();
  const start = () => {
    if (window.location.pathname === "/") window.dispatchEvent(new Event(START_EVENT));
    else router.push("/?tour");
  };
  return (
    <button type="button" onClick={start} className={className}>
      Take the tour
    </button>
  );
}

/**
 * A guided tour of the home page for first-time visitors (anyone whose browser
 * hasn't seen it), and for anyone who asks for it again from the footer. Each
 * step highlights one control with a short card beside it.
 */
export function SiteTour() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // First visit, ?tour from another page, or the footer link on this one.
  useEffect(() => {
    const begin = () => {
      // Drop ?tour once it's started, so a reload or a shared link doesn't start it again.
      const url = new URL(window.location.href);
      if (url.searchParams.has("tour")) {
        url.searchParams.delete("tour");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      setSteps(STEPS.filter((s) => !s.target || visible(s.target)));
      setIndex(0);
    };
    const asked = new URL(window.location.href).searchParams.has("tour");
    const timer = asked || !seen() ? window.setTimeout(begin, asked ? 0 : START_DELAY_MS) : undefined;
    window.addEventListener(START_EVENT, begin);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(START_EVENT, begin);
    };
  }, []);

  const step = index === null ? null : steps[index];

  // Bring the step's element into view and follow it as the page scrolls or resizes.
  useEffect(() => {
    const el = step?.target ? document.querySelector<HTMLElement>(step.target) : null;
    if (!el) return;
    // Just under the sticky header, leaving room for the card below; centred if it's too tall
    // for that. Things in the header itself are always in view.
    if (!el.closest("header")) {
      const r = el.getBoundingClientRect();
      const offset = r.height + HEADER_ROOM + CARD_ROOM <= window.innerHeight ? HEADER_ROOM : (window.innerHeight - r.height) / 2;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + r.top - offset, behavior: reduceMotion ? "auto" : "smooth" });
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [step]);

  useEffect(() => {
    if (step) card.current?.focus();
  }, [step]);

  if (index === null || !step) return null;

  const last = index === steps.length - 1;
  const finish = () => {
    markSeen();
    setIndex(null);
    setRect(null);
  };
  const next = () => (last ? finish() : setIndex(index + 1));
  const back = () => setIndex(Math.max(index - 1, 0));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") finish();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft" && index > 0) back();
    else if (e.key === "Tab") {
      // Keep focus on the card's buttons while the page behind it is covered.
      const buttons = [...(card.current?.querySelectorAll("button") ?? [])];
      const [first, final] = [buttons[0], buttons[buttons.length - 1]];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) {
        e.preventDefault();
        final?.focus();
      } else if (!e.shiftKey && document.activeElement === final) {
        e.preventDefault();
        first?.focus();
      }
    }
  };

  // The card goes on whichever side of the element has more room, inside the screen's edges.
  const highlight = step.target ? rect : null;
  let position: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: `min(360px, calc(100vw - ${2 * GUTTER}px))` };
  if (highlight) {
    const width = Math.min(340, window.innerWidth - 2 * GUTTER);
    const left = Math.min(Math.max(highlight.left, GUTTER), window.innerWidth - width - GUTTER);
    const below = window.innerHeight - highlight.bottom >= highlight.top;
    position = below ? { width, left, top: highlight.bottom + GAP } : { width, left, bottom: window.innerHeight - highlight.top + GAP };
  }

  return (
    <>
      {/* Covers the page so a stray tap doesn't change filters mid-tour; dims it when nothing is highlighted. */}
      <div className={`fixed inset-0 z-[60] ${highlight ? "" : "bg-plum/60"}`} aria-hidden="true" />
      {highlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[61] transition-all duration-300 motion-reduce:transition-none"
          style={{
            top: highlight.top - PAD,
            left: highlight.left - PAD,
            width: highlight.width + 2 * PAD,
            height: highlight.height + 2 * PAD,
            borderRadius: Math.min(34, highlight.height / 2 + PAD),
            boxShadow: "0 0 0 3px var(--color-gold), 0 0 0 9999px rgb(79 18 41 / 0.6)",
          }}
        />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed z-[62] rounded-[24px] bg-panel p-5 text-maroon shadow-xl ring-1 ring-maroon/10 focus:outline-none"
        style={position}
      >
        {index === 0 ? (
          <Image src="/logo-mark.png" alt="" width={44} height={44} className="mb-3 size-11 rounded-full" />
        ) : (
          <p className="mb-1 text-xs font-semibold text-maroon/80">
            {index} of {steps.length - 1}
          </p>
        )}
        <h2 id="tour-title" className="font-display text-xl font-semibold lowercase leading-tight">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-maroon/90">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className="text-sm font-semibold text-maroon underline-offset-2 hover:underline">
            {index === 0 ? "No thanks" : "Skip tour"}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-full px-4 py-1.5 text-sm font-semibold text-maroon ring-1 ring-maroon/30 hover:bg-maroon/5"
              >
                Back
              </button>
            )}
            <button type="button" onClick={next} className="rounded-full bg-maroon px-4 py-1.5 text-sm font-semibold text-cream hover:bg-plum">
              {index === 0 ? "Show me around" : last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
