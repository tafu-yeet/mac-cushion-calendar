"use server";

import { parseUnsubscribe, type UnsubscribeChoice } from "@/lib/email/unsubscribe";
import { unsubscribe, type UnsubscribeResult } from "@/lib/email/unsubscribe-action";
import { createPublicClient } from "@/lib/supabase/public";

export type UnsubscribeState = { result: UnsubscribeResult; choice: UnsubscribeChoice } | null;

/** The tap on the unsubscribe page. No sign-in: the link's token says whose emails these are. */
export async function unsubscribeFromPage(_prev: UnsubscribeState, formData: FormData): Promise<UnsubscribeState> {
  const link = parseUnsubscribe({ t: String(formData.get("t") ?? ""), c: String(formData.get("c") ?? "") });
  if (!link) return { result: "unknown", choice: "all" };
  return { result: await unsubscribe(createPublicClient(), link.token, link.choice, "unsubscribe_link"), choice: link.choice };
}
