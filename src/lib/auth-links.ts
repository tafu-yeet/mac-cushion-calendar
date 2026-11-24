// Pieces of signing in shared by pages, actions and route handlers: where to go next, and the
// short-lived cookies that carry a choice across the trip to Google or the email inbox.

/** A same-site path to go to after signing in, or `fallback`. Never another site. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value.slice(0, 500);
}

/** A club id or event id from a link, or null. */
export function idParam(value: string | null | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Set while signing in when the Sunday picks box was ticked; read once the account exists. */
export const SIGNUP_DIGEST_COOKIE = "mcc_signup_digest";
/** A club to follow once signed in (from "Follow this club" while signed out). */
export const PENDING_FOLLOW_COOKIE = "mcc_pending_follow";
/** Where to go after signing in with Google, which can't carry it in the link. */
export const NEXT_COOKIE = "mcc_next";
export const PENDING_MAX_AGE_S = 60 * 60;

/** What the sign-up box says. Logged with the consent, as CASL asks. */
export const DIGEST_CONSENT_WORDING =
  "Email me Sunday picks: up to 8 events for the week ahead from clubs I follow and things I like, plus free food. From Mac Cushion Calendar. Unsubscribe anytime.";
export const CLUB_POSTS_CONSENT_WORDING =
  "Email me when a club I follow posts a new event, at most once a day. From Mac Cushion Calendar. Unsubscribe anytime.";
export const REMINDERS_CONSENT_WORDING = "Email me a reminder an hour before events I tap Remind me on. From Mac Cushion Calendar. Unsubscribe anytime.";

/** Instagram's and Facebook's in-app browsers, where Google blocks its sign-in (403 disallowed_useragent). */
export const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat/i;
