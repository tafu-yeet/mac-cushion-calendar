import "server-only";

import { campus } from "@/lib/campus";
import { getEventsBetween, getEventsByIds, type PublicEvent } from "@/lib/events";
import { isInterest, type Interest } from "@/lib/member-types";
import { SITE_URL } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, dayStartIso } from "@/lib/time";

import {
  clubPostsWindow,
  dedupeKey,
  digestIsEmpty,
  digestWeek,
  REMINDER_WINDOW_MINUTES,
  remindersDue,
  selectClubPosts,
  selectDigest,
} from "./select";
import { sendEmail } from "./send";
import { clubPostsEmail, digestEmail, reminderEmail, type Recipient, type Rendered } from "./templates";
import { listUnsubscribeHeaders, type EmailChoice } from "./unsubscribe";

// The email job, run every 15 minutes by pg_cron through /api/cron/email. Each run sends what's
// due: reminders, then today's club-posts emails (daytime only), then Sunday picks (Sunday from
// 6 PM). It can't send anything twice: each email first claims a row in email_sends whose
// (user_id, dedupe_key) is unique. A send Resend refused outright stays "failed" for good; one
// it couldn't take right now (rate limit, daily cap, outage) gives its claim back and the run
// stops, so the next run tries again, and Resend's Idempotency-Key stops a double if the first
// one did go out.

type Admin = ReturnType<typeof createAdminClient>;
type Person = Recipient & { userId: string; email: string };
type Kind = "digest" | "club_posts" | "reminder";
export type JobReport = { sent: number; skipped: number; failed: number; notes: string[] };

const GAP_MS = 550; // Resend allows about 2 requests a second
const BUDGET_MS = 240_000; // stop well before the function's time limit; the next run picks up
const CLUB_POSTS_LOOKBACK_MS = 48 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Sender {
  report: JobReport = { sent: 0, skipped: 0, failed: 0, notes: [] };
  private last = 0;
  private halted = false;
  constructor(
    private admin: Admin,
    private started: number,
  ) {}

  /** Out of time, or Resend asked us to wait: either way the next run carries on. */
  get outOfTime() {
    return this.halted || Date.now() - this.started > BUDGET_MS;
  }

  /** Claims the email, sends it, records how it went. False when it was already claimed. */
  async send(to: Person, kind: Kind, key: string, eventIds: number[], choice: EmailChoice, render: () => Rendered): Promise<boolean> {
    const { data: claim, error } = await this.admin
      .from("email_sends")
      .insert({ user_id: to.userId, kind, dedupe_key: key, event_ids: eventIds })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        this.report.skipped++; // already sent (or being sent) by an earlier run
        return false;
      }
      throw new Error(`Couldn't claim ${key}: ${error.message}`);
    }

    const wait = this.last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();

    const email = render();
    const result = await sendEmail({
      to: to.email,
      ...email,
      headers: listUnsubscribeHeaders(SITE_URL, to.token, choice),
      idempotencyKey: `${to.userId}:${key}`,
    });
    if (!result.ok && result.retryable) {
      await this.admin.from("email_sends").delete().eq("id", claim.id);
      this.halted = true;
      this.report.notes.push(`Paused: ${result.error}`);
      return true;
    }
    await this.admin
      .from("email_sends")
      .update(result.ok ? { status: "sent", provider_id: result.id, sent_at: new Date().toISOString() } : { status: "failed", error: result.error })
      .eq("id", claim.id);
    if (result.ok) this.report.sent++;
    else {
      this.report.failed++;
      this.report.notes.push(`${kind} failed: ${result.error}`);
    }
    return true;
  }
}

/** Runs everything due at `nowMs`. Refuses to send without a mailing address (CASL) or an API key. */
export async function runEmailJobs(nowMs = Date.now()): Promise<JobReport> {
  if (!campus.email.mailingAddress.trim()) {
    return { sent: 0, skipped: 0, failed: 0, notes: ["Not sending: campus.config.json email.mailingAddress is empty (CASL needs it in every email)."] };
  }
  if (!process.env.RESEND_API_KEY) return { sent: 0, skipped: 0, failed: 0, notes: ["Not sending: RESEND_API_KEY isn't set."] };

  const admin = createAdminClient();
  const sender = new Sender(admin, Date.now());

  const { data: rows, error } = await admin.rpc("email_recipients");
  if (error) throw new Error(`Couldn't load recipients: ${error.message}`);
  const people = new Map<string, Person & { digest: boolean; clubPosts: boolean; reminders: boolean }>();
  for (const r of rows ?? []) {
    people.set(r.user_id, {
      userId: r.user_id,
      email: r.email,
      name: r.display_name,
      token: r.email_token,
      digest: r.email_digest,
      clubPosts: r.email_club_posts,
      reminders: r.email_reminders,
    });
  }
  const who = (pick: (p: Person & { digest: boolean; clubPosts: boolean; reminders: boolean }) => boolean) => [...people.values()].filter(pick);

  await sendReminders(admin, sender, who((p) => p.reminders), nowMs);
  if (!sender.outOfTime && clubPostsWindow(nowMs)) await sendClubPosts(admin, sender, who((p) => p.clubPosts), nowMs);
  const week = digestWeek(nowMs);
  if (!sender.outOfTime && week) await sendDigests(admin, sender, who((p) => p.digest), week);
  if (sender.outOfTime) sender.report.notes.push("Stopped early: the next run sends the rest.");
  return sender.report;
}

async function sendReminders(admin: Admin, sender: Sender, people: Person[], nowMs: number) {
  if (!people.length) return;
  const byId = new Map(people.map((p) => [p.userId, p]));
  const { data, error } = await admin.from("event_reminders").select("user_id, event_id").in("user_id", [...byId.keys()]);
  if (error) throw new Error(`Couldn't load reminders: ${error.message}`);
  if (!data.length) return;

  const until = new Date(nowMs + REMINDER_WINDOW_MINUTES * 60_000).toISOString();
  const events = (await getEventsByIds([...new Set(data.map((r) => r.event_id))])).filter((e) => e.startsAt <= until);
  const event = new Map(events.map((e) => [e.id, e]));
  const due = remindersDue(
    data.flatMap((r) => {
      const e = event.get(r.event_id);
      return e ? [{ userId: r.user_id, eventId: e.id, startsAt: e.startsAt, startTimeKnown: e.startTimeKnown, cancelled: e.scheduleStatus === "cancelled" }] : [];
    }),
    nowMs,
  );
  for (const r of due) {
    if (sender.outOfTime) return;
    const to = byId.get(r.userId)!;
    const e = event.get(r.eventId)!;
    await sender.send(to, "reminder", dedupeKey.reminder(e.id), [e.id], "reminders", () => reminderEmail(SITE_URL, to, e));
  }
}

async function sendClubPosts(admin: Admin, sender: Sender, people: Person[], nowMs: number) {
  if (!people.length) return;
  const ids = people.map((p) => p.userId);
  const key = dedupeKey.clubPosts(nowMs);
  const [follows, consents, earlier, today] = await Promise.all([
    admin.from("club_follows").select("user_id, club_id, created_at").in("user_id", ids),
    admin.from("email_consents").select("user_id, granted_at").eq("type", "club_posts").is("withdrawn_at", null).in("user_id", ids),
    admin
      .from("email_sends")
      .select("user_id, event_ids")
      .eq("kind", "club_posts")
      .in("user_id", ids)
      .gte("created_at", new Date(nowMs - 60 * 24 * 60 * 60 * 1000).toISOString()),
    admin.from("email_sends").select("user_id").eq("dedupe_key", key).in("user_id", ids),
  ]);
  for (const r of [follows, consents, earlier, today]) if (r.error) throw new Error(`Couldn't load club-posts data: ${r.error.message}`);

  const doneToday = new Set(today.data!.map((r) => r.user_id));
  const clubs = [...new Set(follows.data!.map((f) => f.club_id))];
  if (!clubs.length) return;

  const since = new Date(nowMs - CLUB_POSTS_LOOKBACK_MS).toISOString();
  const { data: fresh, error } = await admin
    .from("events")
    .select("id, club_id, starts_at, reviewed_at, created_at, schedule_status")
    .eq("status", "approved")
    .in("club_id", clubs)
    .gt("starts_at", new Date(nowMs).toISOString())
    .or(`reviewed_at.gt.${since},created_at.gt.${since}`)
    .limit(1000);
  if (error) throw new Error(`Couldn't load new events: ${error.message}`);
  const candidates = fresh.map((e) => ({
    id: e.id,
    clubId: e.club_id,
    startsAt: e.starts_at!,
    approvedAt: e.reviewed_at ?? e.created_at,
    cancelled: e.schedule_status === "cancelled",
  }));
  if (!candidates.length) return;

  for (const to of people) {
    if (sender.outOfTime) return;
    if (doneToday.has(to.userId)) continue;
    const optedIn = consents.data!.filter((c) => c.user_id === to.userId).map((c) => c.granted_at).sort()[0];
    if (!optedIn) continue;
    const picks = selectClubPosts(
      candidates,
      {
        followedAt: new Map(follows.data!.filter((f) => f.user_id === to.userId).map((f) => [f.club_id, f.created_at])),
        optedInAt: optedIn,
        alreadySent: new Set(earlier.data!.filter((s) => s.user_id === to.userId).flatMap((s) => s.event_ids)),
      },
      nowMs,
    );
    if (!picks.length) continue;
    const events = await getEventsByIds(picks.map((p) => p.id));
    if (!events.length) continue;
    await sender.send(to, "club_posts", key, events.map((e) => e.id), "club_posts", () => clubPostsEmail(SITE_URL, to, events));
  }
}

async function sendDigests(admin: Admin, sender: Sender, people: Person[], monday: string) {
  if (!people.length) return;
  const ids = people.map((p) => p.userId);
  const key = dedupeKey.digest(monday);
  const [events, follows, interests, done] = await Promise.all([
    getEventsBetween(dayStartIso(monday), dayStartIso(addDays(monday, 7))),
    admin.from("club_follows").select("user_id, club_id").in("user_id", ids),
    admin.from("user_interests").select("user_id, interest").in("user_id", ids),
    admin.from("email_sends").select("user_id").eq("dedupe_key", key).in("user_id", ids),
  ]);
  for (const r of [follows, interests, done]) if (r.error) throw new Error(`Couldn't load digest data: ${r.error.message}`);
  const sent = new Set(done.data!.map((r) => r.user_id));

  for (const to of people) {
    if (sender.outOfTime) return;
    if (sent.has(to.userId)) continue;
    const digest = selectDigest<PublicEvent>(events, {
      follows: new Set(follows.data!.filter((f) => f.user_id === to.userId).map((f) => f.club_id)),
      interests: interests.data!.filter((i) => i.user_id === to.userId).map((i) => i.interest).filter((i): i is Interest => isInterest(i)),
    });
    if (digestIsEmpty(digest)) continue;
    await sender.send(to, "digest", key, [...digest.picks, ...digest.freeFood].map((e) => e.id), "digest", () =>
      digestEmail(SITE_URL, to, digest, monday),
    );
  }
}
