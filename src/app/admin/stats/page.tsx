import type { Metadata } from "next";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";
import { addDays, formatDay, toLocalInputs, todayInCampus } from "@/lib/time";

export const metadata: Metadata = { title: "Stats" };

const CHART_DAYS = 14;
const TOP_EVENTS = 15;
const APPS = [
  { key: "google", label: "Google Calendar" },
  { key: "outlook", label: "Outlook" },
  { key: "ics", label: "Apple Calendar or other (.ics)" },
];

export default function StatsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-stone-600">
          How often people add events to their calendar from the site (counted when the calendar link or file is
          handed out, once per event per browser a day, so repeat taps count once). Visitors and page views are in
          Vercel&apos;s Analytics tab.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <CalendarAdds />
      </Suspense>
    </div>
  );
}

type Add = { event_id: number; app: string; created_at: string; events: { name: string; starts_at: string | null } | null };

async function CalendarAdds() {
  const { supabase } = await requireAdmin();
  const rows: Add[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("calendar_adds")
      .select("event_id, app, created_at, events(name, starts_at)")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) return <p className="text-sm text-red-700">Couldn&apos;t load calendar adds: {error.message}</p>;
    rows.push(...data);
    if (data.length < 1000) break;
  }

  const today = todayInCampus();
  const dayOf = (iso: string) => toLocalInputs(iso).date;
  const lastWeek = addDays(today, -6);
  const days = Array.from({ length: CHART_DAYS }, (_, i) => addDays(today, i - CHART_DAYS + 1)).map((date) => ({
    date,
    count: rows.filter((r) => dayOf(r.created_at) === date).length,
  }));
  const busiest = Math.max(1, ...days.map((d) => d.count));
  const byEvent = new Map<number, { name: string; count: number }>();
  for (const r of rows) {
    const e = byEvent.get(r.event_id) ?? { name: r.events?.name ?? `#${r.event_id}`, count: 0 };
    byEvent.set(r.event_id, { ...e, count: e.count + 1 });
  }
  const top = [...byEvent.entries()].sort(([, a], [, b]) => b.count - a.count).slice(0, TOP_EVENTS);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Add to calendar</h2>
      <div className="grid grid-cols-3 gap-3">
        <Figure value={rows.filter((r) => dayOf(r.created_at) === today).length} label="Today" />
        <Figure value={rows.filter((r) => dayOf(r.created_at) >= lastWeek).length} label="Last 7 days" />
        <Figure value={rows.length} label="Since counting began" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold">Per day</h3>
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
          <h3 className="text-sm font-semibold">Which calendar</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {APPS.map((a) => (
              <li key={a.key} className="flex justify-between gap-3">
                <span>{a.label}</span>
                <span className="font-medium tabular-nums">{rows.filter((r) => r.app === a.key).length}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Most added events</h3>
        {top.length ? (
          <ol className="divide-y divide-stone-100 text-sm">
            {top.map(([id, e]) => (
              <li key={id} className="flex justify-between gap-3 px-4 py-2">
                <a href={`/events/${id}`} target="_blank" rel="noreferrer" className="underline">
                  {e.name}
                </a>
                <span className="font-medium tabular-nums">{e.count}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-4 py-6 text-sm text-stone-500">Nobody has added an event yet. Counting started Oct 26.</p>
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
