import "server-only";

import { cookies } from "next/headers";
import { after, connection } from "next/server";

import { isInterest, type Member } from "@/lib/member-types";
import { createClient } from "@/lib/supabase/server";
import { todayInCampus } from "@/lib/time";

// Supabase's session cookie, whole or split into numbered chunks.
const SESSION_COOKIE = /^sb-.+-auth-token(?:\.\d+)?$/;

/** Whether this request carries a sign-in cookie at all: no cookie, no database call. */
export async function hasSessionCookie(): Promise<boolean> {
  return (await cookies()).getAll().some((c) => SESSION_COOKIE.test(c.name));
}

/**
 * The signed-in member and everything personal the pages use, or null when signed out.
 * Signed-out requests return at once without touching Supabase, so the public pages cost
 * the same as before. Also logs today in member_days for Stats (not for admins).
 */
export async function getMember(): Promise<Member | null> {
  if (!(await hasSessionCookie())) return null;
  // Personal, and Supabase reads the clock to check the session: render it per request.
  await connection();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [profile, interests, follows, reminders, busy, admin] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, member_number, founding_member, onboarded_at, email_digest, email_club_posts, email_reminders")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_interests").select("interest").eq("user_id", userId),
    supabase.from("club_follows").select("club_id").eq("user_id", userId),
    supabase.from("event_reminders").select("event_id").eq("user_id", userId),
    supabase.from("busy_blocks").select("weekday, start_minute, end_minute, term_ends_on").eq("user_id", userId),
    supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  // Signed in but no profile: the email isn't confirmed yet, or the tables aren't there.
  if (!profile.data) return null;

  const isAdmin = !!admin.data;
  if (!isAdmin) {
    after(async () => {
      // A plain insert: members can't read member_days, and an upsert's conflict check needs to.
      const { error } = await supabase.from("member_days").insert({ user_id: userId, day: todayInCampus() });
      if (error && error.code !== "23505") console.error(`Couldn't log a member day: ${error.message}`);
    });
  }

  const p = profile.data;
  return {
    id: userId,
    name: p.display_name,
    email: typeof claims.claims.email === "string" ? claims.claims.email : null,
    admin: isAdmin,
    memberNumber: p.member_number,
    founding: p.founding_member,
    onboarded: !!p.onboarded_at,
    interests: (interests.data ?? []).map((r) => r.interest).filter(isInterest),
    follows: (follows.data ?? []).map((r) => r.club_id),
    reminders: (reminders.data ?? []).map((r) => r.event_id),
    busy: (busy.data ?? []).map((b) => ({ weekday: b.weekday, start: b.start_minute, end: b.end_minute, termEndsOn: b.term_ends_on })),
    emails: { digest: p.email_digest, clubPosts: p.email_club_posts, reminders: p.email_reminders },
  };
}

/** Whether someone is signed in, for route handlers. Signed out returns at once without asking Supabase. */
export async function isSignedIn(): Promise<boolean> {
  return (await hasSessionCookie()) && !!(await currentUser());
}

/** The signed-in user's id and their Supabase client, or null. For Server Actions: they check it themselves. */
export async function currentUser() {
  // Supabase reads the clock to check the session: never during a prerender (a prefetch with cookies).
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { supabase, userId, email: typeof data.claims.email === "string" ? data.claims.email : null } : null;
}
