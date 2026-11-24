import { NextResponse, type NextRequest } from "next/server";

import { parseUnsubscribe } from "@/lib/email/unsubscribe";
import { unsubscribe } from "@/lib/email/unsubscribe-action";
import { createPublicClient } from "@/lib/supabase/public";

// RFC 8058 one-click unsubscribe: Gmail, Yahoo and Apple Mail POST here from their own
// "Unsubscribe" button (the List-Unsubscribe header). No page, no sign-in.
export async function POST(request: NextRequest) {
  const link = parseUnsubscribe(request.nextUrl.searchParams);
  if (!link) return new NextResponse("Unknown unsubscribe link", { status: 400 });
  const result = await unsubscribe(createPublicClient(), link.token, link.choice, "list_unsubscribe");
  if (result === "error") return new NextResponse("Try again later", { status: 500 });
  // An unknown token (a deleted account) is still "unsubscribed": there's nothing to send to.
  return new NextResponse("Unsubscribed", { status: 200 });
}

// Opening the address in a browser (or a scanner fetching it) shows the page with its button.
export function GET(request: NextRequest) {
  const url = new URL("/unsubscribe", request.url);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url, 303);
}
