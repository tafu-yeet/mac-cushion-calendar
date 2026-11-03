import { requireAdmin } from "@/lib/auth";

const DAYS = 14;
const PAGE = 1000; // Supabase returns at most this many rows a request
// Posters' and stickers' QR codes are tagged utm_source=poster-... or sticker-...
const QR = /^(poster|sticker)/i;

function windowStart(): string {
  return new Date(Date.now() - DAYS * 86_400_000).toISOString();
}

type Source = { name: string; count: number; labels: Map<string, number> };

/** "qr · tuesday-flyer" from utm_medium and utm_content, or "" when the link has neither. */
const labelOf = (medium: string | null, content: string | null) => [medium, content].filter(Boolean).join(" · ");

/**
 * Visits from tagged links (src/components/scan-tracker.tsx) in the last two
 * weeks: posters' and stickers' QR codes, then everything else (an Instagram
 * bio link, say), each source split by utm_medium and utm_content.
 */
export async function ScansPanel() {
  const { supabase } = await requireAdmin();
  const since = windowStart();
  const sources = new Map<string, Source>();
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("scans")
      .select("utm_source, utm_medium, utm_content")
      .gte("created_at", since)
      .range(from, from + PAGE - 1);
    for (const scan of data ?? []) {
      const s = sources.get(scan.utm_source) ?? { name: scan.utm_source, count: 0, labels: new Map() };
      const label = labelOf(scan.utm_medium, scan.utm_content);
      s.count += 1;
      s.labels.set(label, (s.labels.get(label) ?? 0) + 1);
      sources.set(s.name, s);
    }
    if (!data || data.length < PAGE) break;
  }
  const sorted = [...sources.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const groups = [
    { title: "QR (posters & stickers)", sources: sorted.filter((s) => QR.test(s.name)) },
    { title: "Other", sources: sorted.filter((s) => !QR.test(s.name)) },
  ];
  const total = sorted.reduce((n, s) => n + s.count, 0);

  return (
    <section className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
      <h2 className="flex items-baseline justify-between gap-3 font-semibold">
        Tagged visits
        <span className="text-xs font-normal text-stone-500">
          last {DAYS} days · {total} visit{total === 1 ? "" : "s"}
        </span>
      </h2>
      {total ? (
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="flex justify-between gap-3 border-b border-stone-200 pb-1 text-xs font-semibold tracking-wide text-stone-600 uppercase">
                {g.title}
                <span className="tabular-nums">{g.sources.reduce((n, s) => n + s.count, 0)}</span>
              </h3>
              {g.sources.length ? (
                <ul className="flex flex-col divide-y divide-stone-100">
                  {g.sources.map((s) => (
                    <SourceRow key={s.name} source={s} />
                  ))}
                </ul>
              ) : (
                <p className="py-1 text-stone-500">None yet.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-stone-500">
          None yet. End a link with <code className="font-mono">?utm_source=poster-musc</code> (posters and stickers:
          start with <code className="font-mono">poster</code> or <code className="font-mono">sticker</code>), and
          optionally <code className="font-mono">&amp;utm_medium=qr&amp;utm_content=v2</code>. Each browser counts once per
          session.
        </p>
      )}
    </section>
  );
}

/** A source and its count, with a line per medium/content when its links have them. */
function SourceRow({ source }: { source: Source }) {
  const labels = [...source.labels.entries()].sort(([, a], [, b]) => b - a);
  const tagged = labels.some(([label]) => label);
  return (
    <li className="py-1">
      <p className="flex justify-between gap-3">
        <span className="truncate font-mono text-xs">{source.name}</span>
        <span className="tabular-nums">{source.count}</span>
      </p>
      {tagged && (
        <ul className="mt-0.5 flex flex-col pl-3 text-xs text-stone-500">
          {labels.map(([label, count]) => (
            <li key={label} className="flex justify-between gap-3">
              <span className="truncate font-mono">{label || "no medium or content"}</span>
              <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
