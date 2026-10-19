import { requireAdmin } from "@/lib/auth";
import { formatWhen } from "@/lib/time";

// Posts are read within a run or two of being fetched (every 15 minutes), so a
// post still waiting after this long means reading has stopped.
const STALL_HOURS = 2;

function stallCutoff(): string {
  return new Date(Date.now() - STALL_HOURS * 3_600_000).toISOString();
}

/**
 * A warning when the worker keeps fetching posts but has stopped reading them
 * (an unreachable or rejected Claude key stops reading without failing any one
 * post), so a stall shows up here instead of as a quiet, out-of-date site.
 */
export async function WorkerHealth() {
  const { supabase } = await requireAdmin();
  const [{ data: oldest, count }, { data: lastRead }] = await Promise.all([
    supabase
      .from("posts")
      .select("created_at", { count: "exact" })
      .eq("extraction_status", "pending")
      .order("created_at", { ascending: true })
      .limit(1),
    supabase
      .from("posts")
      .select("extracted_at")
      .eq("extraction_status", "done")
      .order("extracted_at", { ascending: false })
      .limit(1),
  ]);
  const waitingSince = oldest?.[0]?.created_at;
  if (!waitingSince || waitingSince > stallCutoff()) return null;

  const last = lastRead?.[0]?.extracted_at;
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-semibold">The worker has stopped reading posts.</p>
      <p className="mt-1">
        {count} post{count === 1 ? "" : "s"} waiting, the oldest since {formatWhen(waitingSince)}
        {last ? `; the last one was read ${formatWhen(last)}` : ""}. New events won&apos;t appear until it&apos;s fixed. On the
        VPS, check the newest file in <code>C:\cushion\worker\logs</code> for the error (usually the Claude API key or
        credit).
      </p>
    </div>
  );
}
