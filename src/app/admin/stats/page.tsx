import type { Metadata } from "next";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";
import { addDays, formatDay, toLocalInputs, todayInCampus } from "@/lib/time";

import { HighlightToggle } from "../highlight-toggle";

export const metadata: Metadata = { title: "Stats", alternates: { canonical: "/admin/stats" } };

const CHART_DAYS = 14;
const ENOUGH_SEEN = 100; // views per group before a difference means much
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
        <HighlightTest />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <CalendarAdds />
      </Suspense>
    </div>
  );
}

type Traction = {
  event_id: number | null;
  highlighted: boolean | null;
  seen: number | null;
  opened: number | null;
  added: number | null;
  calendar_menu: number | null;
  instagram: number | null;
  tickets: number | null;
};

/** Things people did because of an event: opening it, or tapping its Add to calendar, Instagram or tickets buttons. */
const actionsOf = (r: Partial<Traction> | undefined) => (r?.opened ?? 0) + (r?.calendar_menu ?? 0) + (r?.instagram ?? 0) + (r?.tickets ?? 0);
const per100 = (actions: number, seen: number) => (seen ? ((actions / seen) * 100).toFixed(1) : "–");

function totals(rows: Traction[]) {
  const sum = (key: "seen" | "opened" | "added" | "calendar_menu" | "instagram" | "tickets") => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
  return {
    events: rows.length,
    seen: sum("seen"),
    opened: sum("opened"),
    calendar_menu: sum("calendar_menu"),
    instagram: sum("instagram"),
    tickets: sum("tickets"),
    added: sum("added"),
  };
}

/** Do highlighted events get more traction? Counted per event, once per browser session (engagement-tracker.tsx). */
async function HighlightTest() {
  const { supabase } = await requireAdmin();
  const rows: Traction[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("event_traction").select("*").range(from, from + 999);
    if (error) return <p className="text-sm text-red-700">Couldn&apos;t load the highlight test: {error.message}</p>;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const { data: current } = await supabase.from("events").select("id").eq("highlighted", true);
  const on = rows.filter((r) => r.highlighted);
  const off = rows.filter((r) => !r.highlighted);
  const ids = [...new Set([...(current ?? []).map((e) => e.id), ...on.flatMap((r) => (r.event_id === null ? [] : [r.event_id]))])];
  const { data: picked } = ids.length
    ? await supabase.from("events").select("id, name, starts_at, highlighted").in("id", ids).order("starts_at", { ascending: false })
    : { data: [] };
  const groups = [
    { label: "Highlighted", ...totals(on) },
    { label: "Other events", ...totals(off) },
  ];
  const [a, b] = groups;
  const enough = a.seen >= ENOUGH_SEEN && b.seen >= ENOUGH_SEEN;
  const today = todayInCampus();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Highlighted events test</h2>
      <section className="rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-stone-200 text-left text-xs text-stone-600">
              <tr>
                <th className="px-4 py-2 font-medium">Group</th>
                <th className="px-4 py-2 text-right font-medium">Events</th>
                <th className="px-4 py-2 text-right font-medium">Seen</th>
                <th className="px-4 py-2 text-right font-medium">Opened</th>
                <th className="px-4 py-2 text-right font-medium">Calendar menu</th>
                <th className="px-4 py-2 text-right font-medium">Instagram</th>
                <th className="px-4 py-2 text-right font-medium">Tickets</th>
                <th className="px-4 py-2 text-right font-medium">Actions per 100 seen</th>
                <th className="px-4 py-2 text-right font-medium">Added to calendar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {groups.map((g) => (
                <tr key={g.label}>
                  <td className="px-4 py-2 font-medium">{g.label}</td>
                  <td className="px-4 py-2 text-right">{g.events}</td>
                  <td className="px-4 py-2 text-right">{g.seen}</td>
                  <td className="px-4 py-2 text-right">{g.opened}</td>
                  <td className="px-4 py-2 text-right">{g.calendar_menu}</td>
                  <td className="px-4 py-2 text-right">{g.instagram}</td>
                  <td className="px-4 py-2 text-right">{g.tickets}</td>
                  <td className="px-4 py-2 text-right font-semibold">{per100(actionsOf(g), g.seen)}</td>
                  <td className="px-4 py-2 text-right">{g.added}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-stone-200 px-4 py-3 text-sm text-stone-600">
          {enough
            ? "Compare actions per 100 seen, not the totals: the top spot gets a highlighted event seen more, so its totals rise either way."
            : `Too early to tell: each group needs about ${ENOUGH_SEEN} views before a difference means much.`}{" "}
          Seen means at least half of it was on screen; opened means tapped from a list; actions add up opens and taps on
          its Calendar, Instagram and Tickets buttons. Each counts once per event per browser session, not counting admins,
          and adds count from when this tracking began. You also pick which events to highlight, so a strong event can look
          like a strong highlight.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white">
        <h3 className="border-b border-stone-200 px-4 py-3 text-sm font-semibold">Events you&apos;ve highlighted</h3>
        {picked?.length ? (
          <ul className="divide-y divide-stone-100 text-sm">
            {picked.map((e) => {
              const during = on.find((r) => r.event_id === e.id);
              const before = off.find((r) => r.event_id === e.id);
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
                  <span className="min-w-0">
                    <a href={`/events/${e.id}`} target="_blank" rel="noreferrer" className="underline">
                      {e.name}
                    </a>
                    {e.starts_at && <span className="ml-2 text-stone-500">{formatDay(toLocalInputs(e.starts_at).date, "short", today)}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-stone-700 tabular-nums">
                    <span>{during?.seen ?? 0} seen</span>
                    <span>{actionsOf(during)} actions</span>
                    <span className="font-semibold">{per100(actionsOf(during), during?.seen ?? 0)} per 100 seen</span>
                    <span>{during?.added ?? 0} added</span>
                    {before && (before.seen ?? 0) > 0 && <span className="text-stone-500">before: {per100(actionsOf(before), before.seen ?? 0)}</span>}
                    {e.highlighted && <HighlightToggle id={e.id} highlighted />}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-stone-500">
            None yet. On the Review queue&apos;s approved tab, press “☆ Highlight” on an event to bump it to the top of its day.
          </p>
        )}
      </section>
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
