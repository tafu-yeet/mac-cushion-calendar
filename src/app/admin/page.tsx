import Link from "next/link";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";
import { groupDuplicates, rejectableDuplicates } from "@/lib/duplicates";
import { formatWhen, startOfTodayIso, toLocalInputs } from "@/lib/time";

import { EventCard } from "./event-card";
import type { QueueEvent, QueueGroup } from "./queue-types";

const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];
const LIMIT = 200;

type Filters = { status: Status; foodOnly: boolean; showPast: boolean };

export default function QueuePage({ searchParams }: PageProps<"/admin">) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading events…</p>}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const filters: Filters = {
    status: STATUSES.includes(params.status as Status) ? (params.status as Status) : "pending",
    foodOnly: params.food !== "all",
    showPast: params.past === "1",
  };

  let query = supabase
    .from("events")
    .select(
      `id, status, name, event_type, tags, has_free_food, food_description, starts_at, start_time_known,
       ends_at, location, hosted_by, open_to_all, confidence, reason, review_notes, model, club_id, post_id,
       clubs (name, instagram_username), posts (caption, permalink, posted_at, image_path)`,
    )
    .eq("status", filters.status);
  if (filters.foodOnly) query = query.eq("has_free_food", true);
  if (!filters.showPast) query = query.or(`starts_at.is.null,starts_at.gte.${startOfTodayIso()}`);
  const { data: rows, error } = await query.order("starts_at", { ascending: true, nullsFirst: false }).limit(LIMIT);

  if (error) {
    return <p className="text-sm text-red-700">Couldn&apos;t load events: {error.message}</p>;
  }

  // One signed URL request for every image on the page (the bucket is private).
  const paths = [...new Set(rows.map((r) => r.posts?.image_path).filter((p): p is string => !!p))];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("post-images").createSignedUrls(paths, 60 * 60);
    data?.forEach((d) => d.path && d.signedUrl && signed.set(d.path, d.signedUrl));
  }

  const events: QueueEvent[] = rows.map((r) => {
    const start = toLocalInputs(r.starts_at);
    return {
      id: r.id,
      postId: r.post_id,
      status: r.status,
      name: r.name,
      eventType: r.event_type,
      tags: r.tags,
      hasFreeFood: r.has_free_food,
      foodDescription: r.food_description,
      startsAt: r.starts_at,
      startTimeKnown: r.start_time_known,
      startDate: start.date,
      startTime: r.start_time_known ? start.time : "",
      endTime: toLocalInputs(r.ends_at).time,
      location: r.location,
      hostedBy: r.hosted_by,
      openToAll: r.open_to_all ?? true,
      confidence: r.confidence,
      reason: r.reason,
      reviewNotes: r.review_notes,
      model: r.model,
      clubId: r.club_id,
      clubName: r.clubs?.name ?? "Unknown club",
      clubUsername: r.clubs?.instagram_username ?? "",
      caption: r.posts?.caption ?? "",
      permalink: r.posts?.permalink ?? null,
      postedAt: r.posts?.posted_at ?? null,
      imageUrl: r.posts?.image_path ? (signed.get(r.posts.image_path) ?? null) : null,
    };
  });

  const groups: QueueGroup[] =
    filters.status === "pending"
      ? groupDuplicates(events).map((members) => ({
          key: members.map((e) => e.id).join("-"),
          events: members.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
        }))
      : events.map((e) => ({ key: `${e.id}`, events: [e] }));
  const withNotes = events.filter((e) => e.reviewNotes.length > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <FilterBar filters={filters} />
      <p className="text-sm text-stone-600">
        {events.length === LIMIT ? `Showing the first ${LIMIT}` : `${events.length}`} {filters.status} event
        {events.length === 1 ? "" : "s"}
        {filters.foodOnly ? " with free food" : ""}
        {filters.showPast ? "" : ", today onward"}
        {withNotes > 0 && <span className="font-medium text-amber-800"> · {withNotes} flagged for a closer look</span>}
      </p>
      {groups.length === 0 && (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-500">Nothing here. 🎉</p>
      )}
      {groups.map((group) => {
        if (group.events.length === 1) {
          return <EventCard key={group.key} event={group.events[0]} siblingIds={[]} />;
        }
        const days = [
          ...new Set(group.events.filter((e) => e.startsAt).map((e) => formatWhen(e.startsAt, false).replace(", time TBD", ""))),
        ];
        return (
          <section key={group.key} className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-stone-300 p-3">
            <h2 className="px-1 text-sm font-medium text-stone-700">
              {group.events.length} possible duplicates · {days.join(" / ") || "no date"} ·{" "}
              {[...new Set(group.events.map((e) => e.clubName))].join(", ")}
              <span className="font-normal text-stone-500"> — approve the best one and reject the rest in one click.</span>
            </h2>
            {days.length > 1 && (
              <p className="mx-1 rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
                ⚠ These posts give different dates. Check which is right; the one-click reject skips entries with a different date.
              </p>
            )}
            {group.events.map((e) => (
              <EventCard key={e.id} event={e} siblingIds={rejectableDuplicates(e, group.events).map((o) => o.id)} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function FilterBar({ filters }: { filters: Filters }) {
  const href = (change: Partial<Filters>) => {
    const next = { ...filters, ...change };
    const params = new URLSearchParams();
    if (next.status !== "pending") params.set("status", next.status);
    if (!next.foodOnly) params.set("food", "all");
    if (next.showPast) params.set("past", "1");
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  };
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUSES.map((s) => (
        <Link key={s} href={href({ status: s })} className={pill(filters.status === s)}>
          {s[0].toUpperCase() + s.slice(1)}
        </Link>
      ))}
      <span className="mx-1 h-5 w-px bg-stone-300" />
      <Link href={href({ foodOnly: !filters.foodOnly })} className={pill(filters.foodOnly)}>
        Free food only
      </Link>
      <Link href={href({ showPast: !filters.showPast })} className={pill(filters.showPast)}>
        Include past events
      </Link>
    </div>
  );
}
