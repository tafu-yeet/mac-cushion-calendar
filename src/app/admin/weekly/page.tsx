import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";
import { formatDay, todayInCampus } from "@/lib/time";
import { everyDays } from "@/lib/weekly";

import { ActiveToggle, SeriesForm, type SeriesValues } from "./series-form";

export const metadata: Metadata = { title: "Weekly", alternates: { canonical: "/admin/weekly" } };

export default function WeeklyPage({ searchParams }: PageProps<"/admin/weekly">) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly programs</h1>
        <p className="mt-1 text-sm text-stone-600">
          Things that happen every week, like free soup Tuesday to Friday. Each day shows on the site as its own event,
          six weeks ahead, until the last day. When the club posts about one of those days (the week&apos;s menu), its post
          is listed for that day instead. Changes reach the site within 15 minutes.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
        <Programs searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const time = (t: string | null) => (t ? t.slice(0, 5) : "");

async function Programs({ searchParams }: { searchParams: PageProps<"/admin/weekly">["searchParams"] }) {
  const { supabase } = await requireAdmin();
  await connection(); // "until Dec 10" reads the clock, for the year
  const today = todayInCampus();
  const { edit, saved } = await searchParams;
  const [{ data: programs }, { data: clubs }] = await Promise.all([
    supabase.from("event_series").select("*, clubs (name, instagram_username)").order("active", { ascending: false }).order("name"),
    supabase.from("clubs").select("name, instagram_username").eq("active", true).order("name"),
  ]);
  const editing = programs?.find((p) => String(p.id) === edit) ?? null;
  const values: SeriesValues = editing
    ? {
        id: editing.id,
        club: `@${editing.clubs?.instagram_username ?? ""}`,
        name: editing.name,
        category: editing.category,
        days: editing.days,
        start_time: time(editing.start_time),
        end_time: time(editing.end_time),
        location: editing.location ?? "",
        has_free_food: editing.has_free_food,
        food_description: editing.food_description ?? "",
        cost: editing.cost,
        open_to_all: editing.open_to_all,
        description: editing.description ?? "",
        source_url: editing.source_url ?? "",
        starts_on: editing.starts_on,
        ends_on: editing.ends_on,
        skip_dates: editing.skip_dates.join("\n"),
      }
    : {
        id: null, club: "", name: "", category: "social", days: [], start_time: "", end_time: "", location: "",
        has_free_food: true, food_description: "", cost: "free", open_to_all: true, description: "", source_url: "",
        starts_on: today, ends_on: "", skip_dates: "",
      };

  return (
    <>
      {saved && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {saved === "edited" ? "Saved. Its days update" : "Added. Its days appear"} on the site within 15 minutes.
        </p>
      )}
      {programs?.length ? (
        <ul className="flex flex-col divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {programs.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${p.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">
                  {p.name} <span className="font-normal text-stone-600">· @{p.clubs?.instagram_username}</span>
                  {!p.active && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-xs">stopped</span>}
                </p>
                <p className="text-stone-700">
                  {everyDays(p.days)}, {time(p.start_time)}
                  {p.end_time && `–${time(p.end_time)}`} · {p.location ?? "no place set"}
                  {p.has_free_food && ` · ${p.food_description ?? "free food"}`}
                </p>
                <p className="text-stone-500">
                  {formatDay(p.starts_on, "short", today)} to {formatDay(p.ends_on, "short", today)}
                  {p.skip_dates.length > 0 && `, skipping ${p.skip_dates.length} day${p.skip_dates.length === 1 ? "" : "s"}`}
                  {p.source_url && (
                    <>
                      {" · "}
                      <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">
                        announcement
                      </a>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={`/admin/weekly?edit=${p.id}`} className="rounded-md px-2 py-1 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100">
                  Edit
                </Link>
                <ActiveToggle id={p.id} active={p.active} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-500">No weekly programs yet.</p>
      )}
      <SeriesForm
        key={values.id ?? "new"}
        values={values}
        clubs={(clubs ?? []).map((c) => ({ handle: c.instagram_username, name: c.name }))}
      />
    </>
  );
}
