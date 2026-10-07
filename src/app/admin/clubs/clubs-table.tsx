"use client";

import { useActionState, useMemo, useState } from "react";

import { formatWhen } from "@/lib/time";

import { addClub, deleteClub, setClubActive } from "./actions";

export type ClubRow = {
  id: number;
  username: string;
  name: string;
  active: boolean;
  pollHours: number;
  lastCheckedAt: string | null;
};

type Show = "all" | "active" | "paused";

export function ClubsTable({ clubs }: { clubs: ClubRow[] }) {
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^@/, "");
    return clubs.filter(
      (c) =>
        (show === "all" || (show === "active") === c.active) &&
        (!q || c.name.toLowerCase().includes(q) || c.username.includes(q)),
    );
  }, [clubs, search, show]);
  const activeCount = clubs.filter((c) => c.active).length;

  return (
    <div className="flex flex-col gap-5">
      <AddClubForm />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search clubs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
        />
        {(["all", "active", "paused"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShow(s)}
            className={`rounded-full px-3 py-1 text-sm ${
              show === s ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
            }`}
          >
            {s === "all" ? `All ${clubs.length}` : s === "active" ? `Active ${activeCount}` : `Paused ${clubs.length - activeCount}`}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Club</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Checked every</th>
              <th className="px-4 py-2 font-medium">Last checked</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visible.map((club) => (
              <ClubRowView key={club.id} club={club} />
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-center text-sm text-stone-500">No clubs match.</p>}
      </div>
    </div>
  );
}

function ClubRowView({ club }: { club: ClubRow }) {
  return (
    <tr className={club.active ? "" : "text-stone-500"}>
      <td className="px-4 py-2">
        <div className="font-medium text-stone-900">{club.name}</div>
        <a
          href={`https://www.instagram.com/${club.username}/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-stone-500 hover:underline"
        >
          @{club.username}
        </a>
      </td>
      <td className="px-4 py-2">
        <form action={setClubActive.bind(null, club.id, !club.active)}>
          <button
            type="submit"
            title={club.active ? "Stop fetching this club" : "Start fetching this club"}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              club.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-stone-200 text-stone-700 hover:bg-stone-300"
            }`}
          >
            {club.active ? "Active · pause" : "Paused · resume"}
          </button>
        </form>
      </td>
      <td className="px-4 py-2">{club.pollHours} h</td>
      <td className="px-4 py-2">{club.lastCheckedAt ? formatWhen(club.lastCheckedAt) : "Never"}</td>
      <td className="px-4 py-2 text-right">
        <form
          action={deleteClub.bind(null, club.id)}
          onSubmit={(e) => {
            if (!confirm(`Delete @${club.username}? This also deletes its saved posts and events, including approved ones.`)) {
              e.preventDefault();
            }
          }}
        >
          <button type="submit" className="text-xs text-red-700 hover:underline">
            Delete
          </button>
        </form>
      </td>
    </tr>
  );
}

function AddClubForm() {
  const [state, action, pending] = useActionState(addClub, null);
  const field = "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none";

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
        Instagram username or link
        <input name="username" required placeholder="@macmanhunt" className={`${field} w-56`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
        Club name
        <input name="name" required placeholder="Mac ManHunt" className={`${field} w-56`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
        Check every (hours)
        <input name="poll_hours" type="number" min={1} max={168} defaultValue={12} className={`${field} w-28`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add club"}
      </button>
      {state && "error" in state && <p className="w-full text-sm text-red-700">{state.error}</p>}
      {state && "added" in state && <p className="w-full text-sm text-emerald-700">Added @{state.added}. It&apos;s fetched on the next worker run.</p>}
    </form>
  );
}
