import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in admin's Supabase client, or a redirect to /login.
 * Call this in every admin page and Server Action: the proxy's redirect is
 * only a convenience, and row level security is the final backstop.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) {
    redirect("/login");
  }

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (!admin) {
    redirect("/login?error=not-admin");
  }
  return { supabase, userId };
}
