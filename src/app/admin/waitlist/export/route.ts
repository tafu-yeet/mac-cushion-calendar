import { requireAdmin } from "@/lib/auth";
import { todayInCampus } from "@/lib/time";

import { allSignups } from "../signups";

/** One CSV cell: quoted, and a leading = + - @ defused so a spreadsheet can't run it as a formula. */
function cell(value: string | boolean | null): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

// GET /admin/waitlist/export: everyone on the waitlist as a spreadsheet, with what they agreed to.
export async function GET() {
  const { supabase } = await requireAdmin();
  const rows = await allSignups(supabase);
  const lines = [
    ["email", "joined_at", "from", "newsletter", "newsletter_consent_at", "consent"],
    ...rows.map((r) => [r.email, r.created_at, r.source, r.newsletter, r.newsletter_consent_at, r.consent]),
  ].map((fields) => fields.map(cell).join(","));
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="waitlist-${todayInCampus()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
