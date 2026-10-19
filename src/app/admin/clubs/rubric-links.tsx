import { requireAdmin } from "@/lib/auth";

import { decideClubLink } from "./actions";

/**
 * Rubric clubs whose link to one of our Instagram accounts worker/rubric.py
 * wasn't sure of. Until a person confirms one, its Rubric-only events wait.
 */
export async function RubricLinks() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("rubric_societies")
    .select("society_id, name, instagram_username, match_score, clubs (instagram_username, name)")
    .eq("match_status", "review")
    .order("match_score", { ascending: false });
  if (error) return <p className="text-sm text-red-700">Couldn&apos;t load Rubric clubs: {error.message}</p>;
  if (!data.length) return null;

  const button = "rounded-md px-2.5 py-1 text-xs font-medium";
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <h2 className="px-1 text-sm font-medium text-violet-950">
        {data.length} Rubric club{data.length === 1 ? "" : "s"} to check
        <span className="font-normal text-violet-800">
          {" "}
          — is the Rubric club the Instagram account suggested? Their Rubric-only events wait until you say.
        </span>
      </h2>
      {data.map((s) => (
        <form
          key={s.society_id}
          action={decideClubLink}
          className="grid gap-2 rounded-lg bg-white p-2.5 text-sm ring-1 ring-violet-100 md:grid-cols-[1fr_1fr_auto] md:items-center"
        >
          <input type="hidden" name="society_id" value={s.society_id} />
          <a href={`https://campus.hellorubric.com/?s=${s.society_id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
            {s.name}
            {s.instagram_username && <span className="ml-1 text-xs font-normal text-stone-500">(Rubric links @{s.instagram_username})</span>}
          </a>
          <span className="text-stone-700">
            → @{s.clubs?.instagram_username}{" "}
            <span className="text-xs text-stone-500">
              {s.clubs?.name} · {Math.round((s.match_score ?? 0) * 100)}%
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="submit" name="decision" value="yes" className={`${button} bg-emerald-600 text-white hover:bg-emerald-700`}>
              Same club
            </button>
            <button type="submit" name="decision" value="no" className={`${button} border border-stone-300 bg-white hover:bg-stone-100`}>
              Not ours
            </button>
            <input name="username" placeholder="or @username" className="w-28 rounded-md border border-stone-300 px-2 py-1 text-xs" />
            <button type="submit" name="decision" value="other" className={`${button} border border-stone-300 bg-white hover:bg-stone-100`}>
              Link
            </button>
          </div>
        </form>
      ))}
    </section>
  );
}
