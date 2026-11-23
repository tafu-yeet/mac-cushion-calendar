// Supabase's session cookie: only admins sign in, so a visitor with one is an admin.
const SIGNED_IN = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;

/** Whether this browser's visits count in the site's stats: not an admin's, or an automated browser's. Browser only. */
export const countsAsVisitor = () => !navigator.webdriver && !SIGNED_IN.test(document.cookie);

// ── The anonymous visitor id ──────────────────────────────────────────────────────────
// A random id this browser makes up on its first visit, so the site can count weekly
// visitors and who comes back. Nothing else about the person goes with it. It lives in
// localStorage, and in a cookie of the same name so the server can put it on calendar
// adds (src/lib/calendar-adds.ts). When storage is blocked (private browsing, some in-app
// browsers) the id lasts for this page session only, and nothing breaks.

export const VISITOR_KEY = "mcc_vid";
const LAST_VISIT_KEY = "mcc_vid_day"; // the campus date of the last visit logged
const KEEP_FOR_S = 400 * 24 * 60 * 60; // the longest browsers keep a cookie
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` looks like a visitor id. */
export const isVisitorId = (value: string | null | undefined): value is string => !!value && UUID.test(value);

let current: { id: string; isNew: boolean } | null = null; // this page session's, whatever storage allows
let lastVisitInMemory: string | null = null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked or full: the value lasts for this page session only.
  }
}

function readCookie(): string | null {
  try {
    return new RegExp(`(?:^|;\\s*)${VISITOR_KEY}=([^;]+)`).exec(document.cookie)?.[1] ?? null;
  } catch {
    return null;
  }
}

function writeCookie(id: string): void {
  try {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${VISITOR_KEY}=${id}; path=/; max-age=${KEEP_FOR_S}; samesite=lax${secure}`;
  } catch {
    // Cookies blocked: calendar adds go uncounted for this visitor.
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // randomUUID needs https; an http preview still gets a random version 4 id.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

/** This browser's anonymous id, made up on its first visit (`isNew`). Browser only. */
export function visitor(): { id: string; isNew: boolean } {
  if (current) return current;
  try {
    const kept = [read(VISITOR_KEY), readCookie()].find(isVisitorId);
    const id = kept ?? newId();
    write(VISITOR_KEY, id);
    writeCookie(id);
    current = { id, isNew: !kept };
  } catch {
    // No crypto at all (a very old browser): an id for this page session, so nothing throws.
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    current = { id: `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`, isNew: true };
  }
  return current;
}

/** True the first time it's asked on each campus date (`today`), so a visit is logged once a day. */
export function firstVisitOn(today: string): boolean {
  if ((read(LAST_VISIT_KEY) ?? lastVisitInMemory) === today) return false;
  lastVisitInMemory = today;
  write(LAST_VISIT_KEY, today);
  return true;
}

export type ReferrerSource = "instagram" | "direct" | "google" | "other";

/**
 * Where this visit came from, as a category: a utm_source on the link (the site's own
 * links use "ig" for Instagram), else Instagram's in-app browser, else the referring site.
 * Only the category is kept, never the referrer, link or user agent it came from.
 */
export function referrerSource(): ReferrerSource {
  const utm = new URLSearchParams(location.search).get("utm_source")?.trim().toLowerCase();
  if (utm) return /^(ig|instagram)/.test(utm) ? "instagram" : utm.startsWith("google") ? "google" : "other";
  if (/\bInstagram\b/.test(navigator.userAgent)) return "instagram";
  let host = "";
  try {
    host = new URL(document.referrer).hostname;
  } catch {
    // No referrer: typed in, a bookmark, or an app that doesn't send one.
  }
  if (!host || host === location.hostname) return "direct";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)google(\.[a-z]{2,3}){1,2}$/.test(host)) return "google";
  return "other";
}
