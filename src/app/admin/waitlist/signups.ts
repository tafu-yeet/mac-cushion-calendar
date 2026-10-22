import "server-only";

import type { requireAdmin } from "@/lib/auth";

type AdminClient = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export type Signup = {
  id: number;
  email: string;
  newsletter: boolean;
  newsletter_consent_at: string | null;
  source: string | null;
  consent: string;
  created_at: string;
};

const PAGE = 1000; // Supabase returns at most this many rows per request

/** Everyone on the waitlist, newest first. */
export async function allSignups(supabase: AdminClient): Promise<Signup[]> {
  const rows: Signup[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("waitlist")
      .select("id, email, newsletter, newsletter_consent_at, source, consent, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't load the waitlist: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}
