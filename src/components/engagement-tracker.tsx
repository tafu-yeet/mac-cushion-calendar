"use client";

import { useEffect } from "react";

import { countsAsVisitor } from "@/lib/visitor";

// The buttons marked data-tap (with data-tap-event, the event's id).
const TAPS = ["calendar_menu", "instagram", "tickets"] as const;

type Row = { event_id: number; action: "seen" | "open" | (typeof TAPS)[number] };

// What this browser session has counted, so scrolling back or a refresh doesn't count again.
const COUNTED = "cushion-engagement";
const SEND_EVERY_MS = 5000;
const EVENT_PAGE = /^\/events\/(\d+)$/;

/**
 * Counts how events do, for the admin's Stats page: "seen" when at least half of
 * an event marked data-seen-event is on screen, "open" when its link is tapped from
 * a list, and taps on its buttons (Add to calendar, Instagram, tickets or sign-up).
 * Once per event per action per browser session, and nothing about the person. Sent
 * straight to Supabase's REST API with the public key (the table only takes inserts
 * from visitors). Admins and automated browsers aren't counted.
 */
export function EngagementTracker() {
  useEffect(() => {
    if (!countsAsVisitor()) return;
    let counted: Set<string>;
    try {
      counted = new Set(JSON.parse(sessionStorage.getItem(COUNTED) ?? "[]") as string[]);
    } catch {
      return; // no session storage: every refresh would count again
    }
    const waiting: Row[] = [];

    const count = (event_id: number, action: Row["action"]) => {
      const key = `${action}:${event_id}`;
      if (!Number.isInteger(event_id) || counted.has(key)) return;
      counted.add(key);
      try {
        sessionStorage.setItem(COUNTED, JSON.stringify([...counted]));
      } catch {
        // Full or blocked since: this visit still counts once.
      }
      waiting.push({ event_id, action });
    };

    const send = () => {
      if (!waiting.length) return;
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/event_engagement`, {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(waiting.splice(0)),
        keepalive: true, // still sent as the page goes away
      }).catch(() => {
        // A lost count never gets in the visitor's way.
      });
    };

    const onScreen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          count(Number((entry.target as HTMLElement).dataset.seenEvent), "seen");
          onScreen.unobserve(entry.target);
        }
      },
      { threshold: 0.5 },
    );
    const watch = (root: ParentNode) => root.querySelectorAll("[data-seen-event]").forEach((el) => onScreen.observe(el));
    watch(document);
    // Lists change as filters do, and pages change without a reload.
    const added = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-seen-event]")) onScreen.observe(node);
          watch(node);
        }
      }
    });
    added.observe(document.body, { childList: true, subtree: true });

    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const button = e.target.closest<HTMLElement>("[data-tap]");
      const tap = TAPS.find((t) => t === button?.dataset.tap);
      if (tap) {
        count(Number(button?.dataset.tapEvent), tap);
        send();
        return;
      }
      const link = e.target.closest("a[href^='/events/']");
      const id = EVENT_PAGE.exec(link?.getAttribute("href") ?? "")?.[1];
      if (id && !window.location.pathname.startsWith("/events/")) {
        count(Number(id), "open");
        send();
      }
    };
    document.addEventListener("click", onClick, true);
    const timer = setInterval(send, SEND_EVERY_MS);
    window.addEventListener("pagehide", send);

    return () => {
      onScreen.disconnect();
      added.disconnect();
      document.removeEventListener("click", onClick, true);
      clearInterval(timer);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, []);
  return null;
}
