"use client";

import Link from "next/link";
import { useState } from "react";

import { SearchIcon } from "@/components/icons";

export type DirectoryClub = { name: string; username: string; upcoming: number };

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Clubs with events coming up first, the rest folded below (still in the page, for search
 * engines). Typing a name searches them all.
 */
export function ClubDirectory({ clubs, weeks }: { clubs: DirectoryClub[]; weeks: number }) {
  const [q, setQ] = useState("");
  const words = fold(q).split(/\s+/).filter(Boolean);
  const found = words.length ? clubs.filter((c) => words.every((w) => fold(`${c.name} ${c.username}`).includes(w))) : null;
  const active = clubs.filter((c) => c.upcoming > 0);
  const quiet = clubs.filter((c) => c.upcoming === 0);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <label className="flex items-center gap-2.5 rounded-full bg-canvas px-4 ring-1 ring-maroon/25 focus-within:ring-2 focus-within:ring-maroon">
        <SearchIcon className="size-4 shrink-0 text-maroon/75" />
        <span className="sr-only">Search clubs</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clubs, offices, handles…"
          className="min-h-12 w-full bg-transparent text-maroon placeholder:text-maroon/60 focus:outline-none"
        />
      </label>

      {found ? (
        <section className="rounded-[32px] bg-panel p-3 shadow-sm sm:p-5" aria-live="polite">
          <h2 className="px-2 pb-1 text-sm font-semibold text-maroon/85">
            {found.length ? `${found.length} club${found.length === 1 ? "" : "s"} found` : `No club matches “${q.trim()}”`}
          </h2>
          {found.length > 0 && <ClubList clubs={found} weeks={weeks} />}
        </section>
      ) : (
        <>
          <section className="rounded-[32px] bg-panel p-3 shadow-sm sm:p-5" aria-labelledby="with-events">
            <h2 id="with-events" className="px-2 pb-1 font-display text-lg font-semibold lowercase">
              with events coming up <span className="text-maroon/70 tabular-nums">{active.length}</span>
            </h2>
            <ClubList clubs={active} weeks={weeks} />
          </section>
          <details className="group rounded-[32px] bg-canvas px-3 sm:px-5">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-2 font-display text-lg font-semibold lowercase [&::-webkit-details-marker]:hidden">
              <span>
                nothing announced yet <span className="text-maroon/70 tabular-nums">{quiet.length}</span>
              </span>
              <span className="text-sm font-medium normal-case text-maroon/80 group-open:hidden">Show</span>
            </summary>
            <div className="pb-3">
              <ClubList clubs={quiet} weeks={weeks} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function ClubList({ clubs, weeks }: { clubs: DirectoryClub[]; weeks: number }) {
  return (
    <ul className="flex flex-col divide-y divide-maroon/10">
      {clubs.map((c) => (
        <li key={c.username}>
          <Link transitionTypes={["nav"]} href={`/clubs/${c.username}`} className="press flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-canvas">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-maroon">{c.name}</span>
              <span className="block truncate text-xs text-maroon/75">@{c.username}</span>
            </span>
            {c.upcoming > 0 && (
              <span className="shrink-0 rounded-full bg-butter px-2.5 py-0.5 text-xs font-semibold text-maroon" title={`In the next ${weeks} weeks`}>
                {c.upcoming} coming up
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
