"use client";

import { useEffect } from "react";

import { countsAsVisitor } from "@/lib/visitor";

// Once per browser session, so a refresh or the next page doesn't count again.
const LOGGED = "cushion-scan-logged";

/**
 * Logs a visit from a tagged link (?utm_source=..., with utm_medium and utm_content
 * if it has them), like a poster's QR code or an Instagram bio link, to the scans table,
 * straight to Supabase's REST API with the public key (the table only takes
 * inserts from visitors), so no Supabase library ships to the browser. Admins
 * and automated browsers aren't counted.
 */
export function ScanTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const label = (key: string) => params.get(key)?.trim().slice(0, 100) || null;
    const source = label("utm_source");
    if (!source || !countsAsVisitor()) return;
    try {
      if (sessionStorage.getItem(LOGGED)) return;
      sessionStorage.setItem(LOGGED, "1");
    } catch {
      return; // no session storage: a refresh would count twice
    }
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scans`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        utm_source: source,
        utm_medium: label("utm_medium"),
        utm_content: label("utm_content"),
        path: window.location.pathname.slice(0, 300),
        user_agent: navigator.userAgent.slice(0, 500),
      }),
      keepalive: true, // still sent if they tap through to another page right away
    }).catch(() => {
      // A lost count never gets in the visitor's way.
    });
  }, []);
  return null;
}
