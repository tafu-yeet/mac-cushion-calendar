"use server";

import { cookies, headers } from "next/headers";

import { isFeedbackType, MAX_CONTACT, MAX_MESSAGE } from "@/lib/feedback";
import { createPublicClient } from "@/lib/supabase/public";

export type FeedbackState = { status: "sent" } | { status: "error"; message: string } | null;

// At most LIMIT messages per browser per hour: the times of the recent ones
// are kept in a cookie the page can't read or change.
const COOKIE = "cushion-feedback";
const LIMIT = 3;
const HOUR_MS = 60 * 60 * 1000;
// The events this browser has reported cancelled (newest MAX_REPORTED kept for 60 days).
const REPORTED_COOKIE = "cushion-reported";
const MAX_REPORTED = 50;

function recentTimes(value: string | undefined, now: number): number[] {
  try {
    const times: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(times) ? times.filter((t): t is number => typeof t === "number" && now - t < HOUR_MS) : [];
  } catch {
    return [];
  }
}

export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  // Bots fill in every field, including this one people never see: pretend it worked.
  if (formData.get("website")) return { status: "sent" };

  const type = formData.get("type");
  const message = String(formData.get("message") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const eventId = Number(formData.get("event_id"));
  const pageUrl = String(formData.get("page_url") ?? "");

  if (!isFeedbackType(type)) return { status: "error", message: "Pick what this is about." };
  if (!message) return { status: "error", message: "Write a message first." };
  if (message.length > MAX_MESSAGE) return { status: "error", message: `Keep it under ${MAX_MESSAGE} characters.` };
  if (contact.length > MAX_CONTACT) return { status: "error", message: "That contact is too long. An Instagram handle or email is plenty." };

  const store = await cookies();
  const now = Date.now();
  const recent = recentTimes(store.get(COOKIE)?.value, now);
  if (recent.length >= LIMIT) {
    return { status: "error", message: `That's ${LIMIT} in the last hour, thanks! Try again a bit later.` };
  }

  // A "This got cancelled" report counts once per browser per event: two reports flag the event.
  const reported = reportedEvents(store.get(REPORTED_COOKIE)?.value);
  if (type === "cancelled") {
    if (!Number.isInteger(eventId) || eventId <= 0) return { status: "error", message: "Which event? Try again from its page." };
    if (reported.includes(eventId)) return { status: "sent" };
  }

  const { error } = await createPublicClient()
    .from("feedback")
    .insert({
      type,
      message,
      contact: contact || null,
      event_id: Number.isInteger(eventId) && eventId > 0 ? eventId : null,
      page_url: /^https?:\/\//.test(pageUrl) ? pageUrl.slice(0, 500) : null,
      user_agent: (await headers()).get("user-agent")?.slice(0, 500) ?? null,
    });
  if (error) {
    console.error(`Couldn't save feedback: ${error.message}`);
    return { status: "error", message: "Something went wrong on our end. Try again in a minute." };
  }

  const cookie = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;
  store.set(COOKIE, JSON.stringify([...recent, now]), { ...cookie, maxAge: HOUR_MS / 1000 });
  if (type === "cancelled") {
    store.set(REPORTED_COOKIE, JSON.stringify([...reported, eventId].slice(-MAX_REPORTED)), { ...cookie, maxAge: 60 * 24 * 60 * 60 });
  }
  return { status: "sent" };
}

function reportedEvents(value: string | undefined): number[] {
  try {
    const ids: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}
