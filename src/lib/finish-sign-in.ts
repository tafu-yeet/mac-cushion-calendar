import "server-only";

import { cookies } from "next/headers";

import { DIGEST_CONSENT_WORDING, NEXT_COOKIE, PENDING_FOLLOW_COOKIE, SIGNUP_DIGEST_COOKIE, idParam, safeNext } from "@/lib/auth-links";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_BROWSER_COOKIE } from "@/lib/visitor";

/**
 * Every way of signing in ends here: apply what was picked on the way (the Sunday picks box, a
 * club to follow), mark an admin's browser so Stats doesn't count it, and say where to go: the
 * welcome survey the first time, or back to where the member started. The sign-in actions
 * redirect straight there (so the address bar shows the page they land on); Google's return
 * trip goes through /auth/finish, which calls this too.
 */
export async function finishSignIn(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return "/sign-in?error=expired";

  const jar = await cookies();
  const next = safeNext(jar.get(NEXT_COOKIE)?.value);
  const wantsDigest = jar.get(SIGNUP_DIGEST_COOKIE)?.value === "1";
  const follow = idParam(jar.get(PENDING_FOLLOW_COOKIE)?.value);

  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase.from("profiles").select("onboarded_at, email_digest").eq("id", userId).maybeSingle(),
    supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);

  if (profile) {
    const work: PromiseLike<{ error: { message: string } | null }>[] = [];
    if (wantsDigest && !profile.email_digest) {
      work.push(supabase.rpc("set_email_choice", { choice: "digest", enabled: true, how: "signup", shown: DIGEST_CONSENT_WORDING }));
    }
    if (follow) {
      work.push(supabase.from("club_follows").upsert({ user_id: userId, club_id: follow }, { ignoreDuplicates: true }));
    }
    for (const { error } of await Promise.all(work)) {
      if (error) console.error(`Finishing sign-in: ${error.message}`);
    }
  }

  for (const name of [NEXT_COOKIE, SIGNUP_DIGEST_COOKIE, PENDING_FOLLOW_COOKIE]) jar.set(name, "", { maxAge: 0, path: "/" });
  if (admin) jar.set(ADMIN_BROWSER_COOKIE, "1", { maxAge: 60 * 60 * 24 * 400, sameSite: "lax", path: "/" });
  return profile && !profile.onboarded_at ? `/welcome?next=${encodeURIComponent(next)}` : next;
}
