import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * A signed-out Supabase client for public pages. It reads no cookies, so its
 * results can be cached and shared by every visitor; row level security
 * limits it to approved events, their posts, and the club list.
 */
export function createPublicClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
