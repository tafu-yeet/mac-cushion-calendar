import { requireAdmin } from "@/lib/auth";
import { formatWhen } from "@/lib/time";

import { decideMatch } from "./actions";

/**
 * Rubric events and Instagram events that may be the same, scored in the middle
 * band by worker/merge.py. A person's answer is final; the worker merges on its
 * next run when they're the same.
 */
export async function PossibleMatches() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("event_matches")
    .select(
      `rubric_eid, event_id, score, reasons,
       rubric_events (title, starts_at, location, url, rubric_societies (name)),
       events (name, starts_at, start_time_known, location, clubs (instagram_username))`,
    )
    .eq("status", "review")
    .order("score", { ascending: false })
    .limit(50);
  if (error) return <p className="text-sm text-red-700">Couldn&apos;t load possible matches: {error.message}</p>;
  if (!data.length) return null;

  const button = "rounded-md px-3 py-1 text-sm font-medium";
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <h2 className="px-1 text-sm font-medium text-violet-950">
        {data.length} possible match{data.length === 1 ? "" : "es"} between Rubric and Instagram
        <span className="font-normal text-violet-800"> — same event, or two different ones?</span>
      </h2>
      {data.map((m) => {
        const r = m.rubric_events;
        const e = m.events;
        if (!r || !e) return null;
        return (
          <form
            key={`${m.rubric_eid}-${m.event_id}`}
            action={decideMatch}
            className="grid gap-2 rounded-lg bg-white p-3 text-sm ring-1 ring-violet-100 md:grid-cols-[1fr_1fr_auto] md:items-center"
          >
            <input type="hidden" name="rubric_eid" value={m.rubric_eid} />
            <input type="hidden" name="event_id" value={m.event_id} />
            <div>
              <span className="mr-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-900">Rubric</span>
              <a href={r.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {r.title}
              </a>
              <p className="text-xs text-stone-600">
                {r.rubric_societies?.name} · {formatWhen(r.starts_at)}
                {r.location ? ` · ${r.location}` : ""}
              </p>
            </div>
            <div>
              <span className="mr-1 rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-semibold text-pink-900">IG</span>
              <span className="font-medium">
                #{m.event_id} {e.name}
              </span>
              <p className="text-xs text-stone-600">
                @{e.clubs?.instagram_username} · {formatWhen(e.starts_at, e.start_time_known)}
                {e.location ? ` · ${e.location}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">score {Math.round(m.score * 100)}%</span>
              <button type="submit" name="decision" value="same" className={`${button} bg-emerald-600 text-white hover:bg-emerald-700`}>
                Same event
              </button>
              <button type="submit" name="decision" value="different" className={`${button} border border-stone-300 bg-white hover:bg-stone-100`}>
                Different
              </button>
            </div>
          </form>
        );
      })}
    </section>
  );
}
