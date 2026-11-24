import "server-only";

import { redirect } from "next/navigation";

import { getMember } from "@/lib/member";
import type { Member } from "@/lib/member-types";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in admin's Supabase client, or a redirect to the sign-in page.
 * Call this in every admin page and Server Action: the proxy's redirect is
 * only a convenience, and row level security is the final backstop.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/sign-in?next=/admin");
  }

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!admin) {
    redirect("/sign-in?next=/admin&error=not-admin");
  }
  return { supabase, userId };
}

/** The signed-in member, or a redirect to the sign-in page that comes back to `here`. */
export async function requireMember(here: string): Promise<Member> {
  const member = await getMember();
  if (!member) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  return member;
}
