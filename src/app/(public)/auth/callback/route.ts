import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Back from Google: trade the one-time code for a session, then finish signing in.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/auth/finish", request.url));
    console.error(`Google sign-in: ${error.code ?? error.name}: ${error.message}`);
  }
  return NextResponse.redirect(new URL("/sign-in?error=google", request.url));
}
