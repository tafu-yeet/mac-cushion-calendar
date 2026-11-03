import { requireAdmin } from "@/lib/auth";

const DAYS = 14;
const PAGE = 1000; // Supabase returns at most this many rows a request

function windowStart(): string {
  return new Date(Date.now() - DAYS * 86_400_000).toISOString();
}

/** Visits from QR codes in the last two weeks, per utm_source (src/components/scan-tracker.tsx). */
export async function ScansPanel() {
  const { supabase } = await requireAdmin();
  const since = windowStart();
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from("scans").select("utm_source").gte("created_at", since).range(from, from + PAGE - 1);
    for (const { utm_source } of data ?? []) counts.set(utm_source, (counts.get(utm_source) ?? 0) + 1);
    if (!data || data.length < PAGE) break;
  }
  const rows = [...counts.entries()].sort(([, a], [, b]) => b - a);
  const total = rows.reduce((n, [, c]) => n + c, 0);

  return (
    <section className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
      <h2 className="flex items-baseline justify-between gap-3 font-semibold">
        Scans
        <span className="text-xs font-normal text-stone-500">
          last {DAYS} days · {total} visit{total === 1 ? "" : "s"}
        </span>
      </h2>
      {rows.length ? (
        <ul className="mt-2 flex flex-col divide-y divide-stone-100">
          {rows.map(([source, count]) => (
            <li key={source} className="flex justify-between gap-3 py-1">
              <span className="truncate font-mono text-xs">{source}</span>
              <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-stone-500">
          No scans yet. End a QR code&apos;s link with <code className="font-mono">?utm_source=musc-poster</code> (any name)
          to count visits from it, once per browser session.
        </p>
      )}
    </section>
  );
}
