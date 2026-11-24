import { NextResponse, type NextRequest } from "next/server";

import { finishSignIn } from "@/lib/finish-sign-in";

/** Google's sign-in comes back through /auth/callback to here: finish signing in, then go on. */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(await finishSignIn(), request.url));
}
