"use client";

import { useEffect } from "react";

// Once per browser session, so a refresh or the next page doesn't count again.
const LOGGED = "cushion-scan-logged";
// Supabase's session cookie: only admins sign in, so a visitor with one is an admin.
const SIGNED_IN = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;

/**
 * Logs a visit from a QR code (a link with ?utm_source=...) to the scans table,
 * straight to Supabase's REST API with the public key (the table only takes
 * inserts from visitors), so no Supabase library ships to the browser. Admins
 * and automated browsers aren't counted.
 */
export function ScanTracker() {
  useEffect(() => {
    const source = new URLSearchParams(window.location.search).get("utm_source")?.trim();
    if (!source || navigator.webdriver || SIGNED_IN.test(document.cookie)) return;
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
        utm_source: source.slice(0, 100),
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
