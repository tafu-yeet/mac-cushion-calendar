import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runEmailJobs } from "@/lib/email/jobs";

// Called every 15 minutes by pg_cron (supabase/migrations/20261124130000_member_email_cron.sql)
// with "Authorization: Bearer <CRON_SECRET>". Anyone else gets a 401. Running it twice at once
// is safe: every email is claimed in email_sends before it's sent.
export const maxDuration = 300;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const got = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const have = Buffer.from(got);
  return have.length === want.length && timingSafeEqual(have, want);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const report = await runEmailJobs();
    if (report.sent || report.failed) console.log(`Member emails: ${JSON.stringify(report)}`);
    return NextResponse.json(report);
  } catch (e) {
    console.error(`Member email job failed: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
