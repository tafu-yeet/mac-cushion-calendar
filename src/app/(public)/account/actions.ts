"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  CLUB_POSTS_CONSENT_WORDING,
  DIGEST_CONSENT_WORDING,
  PENDING_FOLLOW_COOKIE,
  PENDING_MAX_AGE_S,
  REMINDERS_CONSENT_WORDING,
  idParam,
  safeNext,
} from "@/lib/auth-links";
import type { EmailChoice } from "@/lib/email/unsubscribe";
import { currentUser } from "@/lib/member";
import { isInterest, type Interest } from "@/lib/member-types";
import { isValidBlock, mergeBlocks, type BusyBlock } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";

// What members change for themselves. Every action checks who's signed in, and row level
// security checks again: a member can only ever touch their own rows.

export type Saved = { ok: true } | { ok: false; error: string };

const SIGNED_OUT: Saved = { ok: false, error: "You've been signed out. Sign in again to save this." };
const FAILED: Saved = { ok: false, error: "That didn't save. Try again." };

const WORDING: Record<EmailChoice, string> = {
  digest: DIGEST_CONSENT_WORDING,
  club_posts: CLUB_POSTS_CONSENT_WORDING,
  reminders: REMINDERS_CONSENT_WORDING,
};

function failed(what: string, error: { message: string }): Saved {
  console.error(`${what}: ${error.message}`);
  return FAILED;
}

/** Follows or unfollows a club. */
export async function setFollow(clubId: number, follow: boolean): Promise<Saved> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  if (!idParam(String(clubId))) return FAILED;
  const { error } = follow
    ? await user.supabase.from("club_follows").upsert({ user_id: user.userId, club_id: clubId }, { ignoreDuplicates: true })
    : await user.supabase.from("club_follows").delete().eq("user_id", user.userId).eq("club_id", clubId);
  return error ? failed("Follow", error) : { ok: true };
}

/** Signed out, "Follow" goes to sign-in first: remember the club, and follow it once they're in. */
export async function followAfterSignIn(clubId: number, here: string): Promise<void> {
  const jar = await cookies();
  if (idParam(String(clubId))) {
    jar.set(PENDING_FOLLOW_COOKIE, String(clubId), { httpOnly: true, sameSite: "lax", maxAge: PENDING_MAX_AGE_S, path: "/" });
  }
  redirect(`/sign-in?next=${encodeURIComponent(safeNext(here))}`);
}

/**
 * "Remind me" on or off for an event. Turning the first one on also turns reminder emails on,
 * since the member just tapped a button that said so (logged as consent from "remind_button").
 */
export async function setReminder(eventId: number, on: boolean): Promise<Saved> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  if (!idParam(String(eventId))) return FAILED;
  if (!on) {
    const { error } = await user.supabase.from("event_reminders").delete().eq("user_id", user.userId).eq("event_id", eventId);
    return error ? failed("Reminder", error) : { ok: true };
  }
  const { error } = await user.supabase.from("event_reminders").upsert({ user_id: user.userId, event_id: eventId }, { ignoreDuplicates: true });
  if (error) return failed("Reminder", error);
  const { data: profile } = await user.supabase.from("profiles").select("email_reminders").eq("id", user.userId).maybeSingle();
  if (profile && !profile.email_reminders) {
    const { error: consent } = await user.supabase.rpc("set_email_choice", {
      choice: "reminders",
      enabled: true,
      how: "remind_button",
      shown: REMINDERS_CONSENT_WORDING,
    });
    if (consent) return failed("Reminder emails", consent);
  }
  return { ok: true };
}

/** One email on or off, from the account page. */
export async function setEmailChoice(choice: EmailChoice, enabled: boolean): Promise<Saved> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  if (!(choice in WORDING)) return FAILED;
  const { error } = await user.supabase.rpc("set_email_choice", {
    choice,
    enabled,
    how: "settings",
    shown: enabled ? WORDING[choice] : undefined,
  });
  if (error) return failed("Email choice", error);
  return { ok: true };
}

async function replaceInterests(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>, interests: Interest[]) {
  const { error } = await user.supabase.from("user_interests").delete().eq("user_id", user.userId);
  if (error || !interests.length) return error;
  return (await user.supabase.from("user_interests").insert(interests.map((interest) => ({ user_id: user.userId, interest })))).error;
}

/** The interests picked on the account page, replacing the old ones. */
export async function setInterests(picked: string[]): Promise<Saved> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const error = await replaceInterests(user, [...new Set(picked.filter(isInterest))]);
  if (error) return failed("Interests", error);
  return { ok: true };
}

/** The welcome survey: interests and emails, or a skip. Either way it's done and won't show again. */
export async function finishWelcome(formData: FormData): Promise<void> {
  const user = await currentUser();
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);

  if (formData.get("intent") !== "skip") {
    const interests = [...new Set(formData.getAll("interest").map(String).filter(isInterest))];
    const error = await replaceInterests(user, interests);
    if (error) console.error(`Welcome interests: ${error.message}`);
    const { data: profile } = await user.supabase
      .from("profiles")
      .select("email_digest, email_club_posts, email_reminders")
      .eq("id", user.userId)
      .maybeSingle();
    const on = { digest: profile?.email_digest, club_posts: profile?.email_club_posts, reminders: profile?.email_reminders };
    for (const choice of Object.keys(WORDING) as EmailChoice[]) {
      if (formData.get(`email_${choice}`) !== "on" || on[choice]) continue;
      const { error: consent } = await user.supabase.rpc("set_email_choice", { choice, enabled: true, how: "welcome", shown: WORDING[choice] });
      if (consent) console.error(`Welcome email choice: ${consent.message}`);
    }
  }
  const { error } = await user.supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.userId);
  if (error) console.error(`Welcome done: ${error.message}`);
  redirect(next);
}

/** The name shown on the account page and in emails ("Hi Sam"). Empty clears it. */
export async function setName(name: string): Promise<Saved> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 60);
  const { error } = await user.supabase.from("profiles").update({ display_name: clean || null }).eq("id", user.userId);
  if (error) return failed("Name", error);
  return { ok: true };
}

/** Replaces the member's weekly class blocks: from a calendar file or the tap grid. */
export async function saveSchedule(blocks: BusyBlock[], source: "ics" | "grid"): Promise<Saved> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const clean = mergeBlocks(blocks.filter(isValidBlock)).slice(0, 80);
  const { error } = await user.supabase.from("busy_blocks").delete().eq("user_id", user.userId);
  if (error) return failed("Schedule", error);
  if (clean.length) {
    const { error: insert } = await user.supabase.from("busy_blocks").insert(
      clean.map((b) => ({
        user_id: user.userId,
        weekday: b.weekday,
        start_minute: b.start,
        end_minute: b.end,
        term_ends_on: b.termEndsOn,
        source,
      })),
    );
    if (insert) return failed("Schedule", insert);
  }
  refresh();
  return { ok: true };
}

/** A new password, for an account that signed up with a code or Google, or after "Forgot your password?". */
export async function setPassword(_prev: Saved | null, formData: FormData): Promise<Saved | null> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, error: "Pick a password of at least 8 characters." };
  const { error } = await user.supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") return { ok: false, error: "That password is too common. Pick another." };
    if (error.code === "same_password") return { ok: false, error: "That's already your password." };
    if (error.code === "reauthentication_needed") {
      return { ok: false, error: "For your safety, sign out and back in with a code, then set it again." };
    }
    return failed("Password", error);
  }
  return { ok: true };
}

/**
 * Deletes the account and everything in it: profile, interests, follows, schedule, reminders,
 * consents and the email log all go with it (on delete cascade). Can't be undone.
 */
export async function deleteAccount(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) redirect("/");
  if (formData.get("confirm") !== "on") redirect("/account?delete=confirm");
  const { error } = await createAdminClient().auth.admin.deleteUser(user.userId);
  if (error) {
    console.error(`Deleting an account: ${error.message}`);
    redirect("/account?delete=failed");
  }
  await user.supabase.auth.signOut({ scope: "local" });
  redirect("/?account=deleted");
}
