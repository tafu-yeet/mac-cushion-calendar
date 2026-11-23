"use client";

import { useEffect } from "react";

import { campusDate } from "@/lib/time";
import { countsAsVisitor, firstVisitOn, referrerSource, visitor } from "@/lib/visitor";

/**
 * Logs one row in visits per visitor per campus day, with the anonymous visitor id, the
 * page they landed on and where they came from, for weekly visitor and retention counts.
 * Sent straight to Supabase's REST API with the public key (the table only takes inserts
 * from visitors), after the page has rendered. Admins and automated browsers aren't
 * counted, and a failure is never shown.
 */
export function VisitTracker() {
  useEffect(() => {
    try {
      if (!countsAsVisitor()) return;
      const { id, isNew } = visitor();
      if (!firstVisitOn(campusDate(Date.now()))) return;
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/visits`, {
        method: "POST",
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          visitor_id: id,
          path: window.location.pathname.slice(0, 300),
          referrer_source: referrerSource(),
          is_new: isNew,
        }),
        keepalive: true, // still sent if they tap through to another page right away
      }).catch(() => {
        // A lost count never gets in the visitor's way.
      });
    } catch {
      // Nor does anything else here.
    }
  }, []);
  return null;
}
