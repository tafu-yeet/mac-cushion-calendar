"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page's server data every few minutes, so "on now" stays true while the tab is open. */
export function AutoRefresh({ minutes = 5 }: { minutes?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), minutes * 60 * 1000);
    return () => clearInterval(timer);
  }, [router, minutes]);
  return null;
}
