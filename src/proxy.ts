import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Signed-out visitors skip the proxy entirely, so the public pages cost what they did
  // before accounts. It runs on the sign-in pages, and on any page (not images, icons,
  // calendar files, /api or Next's own assets) when the browser carries a session cookie,
  // whole or split into numbered chunks when it's large.
  // Matchers must be literals, so the cookie name, which holds the Supabase project's id,
  // is written out here. Update both lines if the project ever changes.
  matcher: [
    "/admin/:path*",
    "/sign-in",
    "/auth/:path*",
    "/account/:path*",
    "/welcome",
    {
      source: "/((?!api|_next/static|_next/image|.*\.(?:png|jpg|jpeg|svg|ico|webp|gif|ics|txt|xml)$).*)",
      has: [{ type: "cookie", key: "sb-rscotmnwyisywqzteseu-auth-token" }],
    },
    {
      source: "/((?!api|_next/static|_next/image|.*\.(?:png|jpg|jpeg|svg|ico|webp|gif|ics|txt|xml)$).*)",
      has: [{ type: "cookie", key: "sb-rscotmnwyisywqzteseu-auth-token.0" }],
    },
  ],
};
