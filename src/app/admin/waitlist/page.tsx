import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";
import { addDays, formatDay, formatWhen, toLocalInputs, todayInCampus } from "@/lib/time";

import { CopyLink, RemoveButton } from "./controls";
import { allSignups, type Signup } from "./signups";

export const metadata: Metadata = { title: "Waitlist" };

// One link per place it's posted, so the "From" column shows which one works.
const SHARE_LINKS = [
  { label: "Instagram story", from: "story" },
  { label: "Instagram post", from: "post" },
  { label: "Instagram bio", from: "bio" },
];

const CHART_DAYS = 14;

export default function WaitlistAdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
        <p className="mt-1 text-sm text-stone-600">
          Sign-ups from the{" "}
          <Link href="/waitlist" className="underline">
            waitlist page
          </Link>
          . Share a different link in each place
          to see which one brings people in.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {SHARE_LINKS.map((link) => (
          <CopyLink key={link.from} label={link.label} url={`${SITE_URL}/waitlist?from=${link.from}`} />
        ))}
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading sign-ups…</p>}>
        <Signups />
      </Suspense>
    </div>
  );
}

/** Sign-ups per campus day, oldest first, for the last CHART_DAYS days. */
function perDay(rows: Signup[], today: string): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const date = toLocalInputs(r.created_at).date;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from({ length: CHART_DAYS }, (_, i) => addDays(today, i - CHART_DAYS + 1)).map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

async function Signups() {
  const { supabase } = await requireAdmin();
  const rows = await allSignups(supabase);
  const today = todayInCampus();

  const newsletter = rows.filter((r) => r.newsletter).length;
  const days = perDay(rows, today);
  const lastWeek = days.slice(-7).reduce((n, d) => n + d.count, 0);
  const busiest = Math.max(1, ...days.map((d) => d.count));
  const bySource = [...rows.reduce((m, r) => m.set(r.source ?? "", (m.get(r.source ?? "") ?? 0) + 1), new Map<string, number>())].sort(
    ([, a], [, b]) => b - a,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure value={rows.length} label="On the waitlist" />
        <Figure value={newsletter} label={`Want the newsletter${rows.length ? ` (${Math.round((newsletter / rows.length) * 100)}%)` : ""}`} />
        <Figure value={days[days.length - 1].count} label="Joined today" />
        <Figure value={lastWeek} label="Joined in the last 7 days" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Sign-ups per day</h2>
          <div className="mt-3 flex h-32 items-end gap-1">
            {days.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${formatDay(d.date, "short")}: ${d.count}`}>
                <div className="rounded-t bg-stone-800" style={{ height: `${(d.count / busiest) * 100}%`, minHeight: d.count ? 4 : 1 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-stone-500">
            <span>{formatDay(days[0].date, "short")}</span>
            <span>Today</span>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Where they came from</h2>
          {bySource.length ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {bySource.map(([source, count]) => (
                <li key={source} className="flex justify-between gap-3">
                  <span className={source ? "" : "text-stone-500"}>{source || "No link tag"}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">Nobody yet.</p>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold">Everyone ({rows.length})</h2>
          {rows.length > 0 && (
            <a href="/admin/waitlist/export" className="text-sm font-medium text-stone-700 underline hover:text-stone-900">
              Download CSV
            </a>
          )}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">Newsletter</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 break-all">{r.email}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-stone-600">{formatWhen(r.created_at)}</td>
                    <td className="px-4 py-2 text-stone-600">{r.source ?? "–"}</td>
                    <td className="px-4 py-2">{r.newsletter ? "Yes" : "–"}</td>
                    <td className="px-4 py-2 text-right">
                      <RemoveButton id={r.id} email={r.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-stone-500">No sign-ups yet. Share one of the links above.</p>
        )}
      </section>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-stone-600">{label}</p>
    </div>
  );
}
