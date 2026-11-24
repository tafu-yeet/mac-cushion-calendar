// What the site knows about a signed-in member, as the pages use it. Shared by the server
// (src/lib/member.ts) and the browser (src/components/member-provider.tsx), so nothing here
// may import server-only code.

import { CATEGORIES, type Category } from "@/lib/categories";
import type { PublicEvent } from "@/lib/events";
import type { BusyBlock } from "@/lib/schedule";

/** The welcome survey's choices: every event category, and free food. Keys match public.user_interests. */
export type Interest = Category | "free_food";
export const INTERESTS: { key: Interest; label: string }[] = [
  { key: "free_food", label: "Free food" },
  ...CATEGORIES.map((c) => ({ key: c.key as Interest, label: c.label })),
];
export const isInterest = (value: string): value is Interest => INTERESTS.some((i) => i.key === value);

export type EmailChoices = { digest: boolean; clubPosts: boolean; reminders: boolean };

export type Member = {
  id: string;
  name: string | null;
  email: string | null;
  admin: boolean;
  memberNumber: number | null;
  founding: boolean;
  onboarded: boolean;
  interests: Interest[];
  follows: number[]; // club ids
  reminders: number[]; // event ids with "Remind me" on
  busy: BusyBlock[];
  emails: EmailChoices;
};

/** Whether an event matches what the member picked: one of their categories, or free food. */
export function matchesInterests(e: Pick<PublicEvent, "category" | "hasFreeFood">, interests: readonly Interest[]): boolean {
  if (interests.length === 0) return false;
  return interests.includes(e.category) || (e.hasFreeFood && interests.includes("free_food"));
}

/**
 * A signed-in member's order for a list already sorted by start time: events matching their
 * interests first, then the rest, each part keeping its order. With no interests (or signed
 * out) the list is unchanged, so everyone else sees the usual ranking.
 */
export function rankForMember<E extends Pick<PublicEvent, "category" | "hasFreeFood">>(events: E[], interests: readonly Interest[] | null | undefined): E[] {
  if (!interests?.length) return events;
  return [...events.filter((e) => matchesInterests(e, interests)), ...events.filter((e) => !matchesInterests(e, interests))];
}
