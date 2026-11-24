"use client";

import { useMemo } from "react";

import type { Personal } from "@/lib/filters";
import type { Interest } from "@/lib/member-types";
import { scheduleExpired } from "@/lib/schedule";

import { useMember } from "./member-provider";

/** What the member's filters and chips show: whether they have a class schedule, and whether it's ended. */
export type MineChips = { hasSchedule: boolean; expired: boolean };

/**
 * The signed-in member's follows, class blocks and interests, as the event lists use them.
 * Signed out (or not known yet) it's all empty, and the lists behave exactly as before.
 */
export function usePersonal(today: string): { personal: Personal | null; mine: MineChips | null; interests: Interest[] } {
  const { member } = useMember();
  return useMemo(() => {
    if (!member) return { personal: null, mine: null, interests: [] };
    return {
      personal: { follows: new Set(member.follows), busy: member.busy, today },
      mine: { hasSchedule: member.busy.length > 0, expired: scheduleExpired(member.busy, today) },
      interests: member.interests,
    };
  }, [member, today]);
}
