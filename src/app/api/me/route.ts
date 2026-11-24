import { NextResponse } from "next/server";

import { getMember } from "@/lib/member";

// The signed-in member for the browser (src/components/member-provider.tsx): null when signed
// out. Never cached anywhere, since it's one person's.
export async function GET() {
  const member = await getMember();
  return NextResponse.json(member, { headers: { "Cache-Control": "private, no-store" } });
}
