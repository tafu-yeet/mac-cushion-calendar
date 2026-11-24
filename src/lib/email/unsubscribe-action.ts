// Turns emails off for whoever an unsubscribe link names. Used by the unsubscribe page and the
// one-click endpoint. It runs as the public role: public.unsubscribe (a security definer
// function) finds the member by their email_token and logs the withdrawal in email_consents.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import type { UnsubscribeChoice } from "./unsubscribe";

export type UnsubscribeResult = "done" | "unknown" | "error";

export async function unsubscribe(
  client: Pick<SupabaseClient<Database>, "rpc">,
  token: string,
  choice: UnsubscribeChoice,
  how: "unsubscribe_link" | "list_unsubscribe",
): Promise<UnsubscribeResult> {
  const { data, error } = await client.rpc("unsubscribe", { token, choice, how });
  if (error) {
    console.error(`Unsubscribe failed: ${error.message}`);
    return "error";
  }
  return data ? "done" : "unknown";
}
