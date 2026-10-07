import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only the signed-in parts of the site need the session refreshed.
  matcher: ["/admin/:path*", "/login"],
};
