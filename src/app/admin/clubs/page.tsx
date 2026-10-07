import type { Metadata } from "next";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";

import { ClubsTable, type ClubRow } from "./clubs-table";

export const metadata: Metadata = { title: "Clubs" };

export default function ClubsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clubs</h1>
        <p className="mt-1 text-sm text-stone-600">
          Active clubs are fetched on schedule. Pausing keeps a club&apos;s history; deleting removes it and its events.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading clubs…</p>}>
        <Clubs />
      </Suspense>
    </div>
  );
}

async function Clubs() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("clubs")
    .select("id, instagram_username, name, active, poll_interval_minutes, last_checked_at")
    .order("name");
  if (error) {
    return <p className="text-sm text-red-700">Couldn&apos;t load clubs: {error.message}</p>;
  }

  const clubs: ClubRow[] = data.map((c) => ({
    id: c.id,
    username: c.instagram_username,
    name: c.name,
    active: c.active,
    pollHours: Math.round((c.poll_interval_minutes / 60) * 10) / 10,
    lastCheckedAt: c.last_checked_at,
  }));
  return <ClubsTable clubs={clubs} />;
}
