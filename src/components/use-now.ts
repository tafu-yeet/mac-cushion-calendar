"use client";

import { useEffect, useState } from "react";

const TICK_MS = 30_000;

/**
 * The current time, ticking every 30 seconds so "On now" and "Starts in"
 * stay true while a page sits open. Starts from the server's time so the
 * first render matches the HTML.
 */
export function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, TICK_MS);
    // A phone that slept in someone's pocket catches up as soon as it's looked at.
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}
