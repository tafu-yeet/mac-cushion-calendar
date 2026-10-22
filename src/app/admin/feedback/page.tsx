import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { requireAdmin } from "@/lib/auth";
import { ALL_FEEDBACK_TYPES, feedbackLabel, isFeedbackType, type FeedbackType } from "@/lib/feedback";
import { formatWhen } from "@/lib/time";

import { DoneToggle } from "./done-toggle";

export const metadata: Metadata = { title: "Feedback" };

const SHOWN = 300;

export default function FeedbackPage({ searchParams }: PageProps<"/admin/feedback">) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="mt-1 text-sm text-stone-600">
          From the site&apos;s feedback links, newest first. Tick one off once you&apos;ve dealt with it.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-stone-500">Loading feedback…</p>}>
        <FeedbackList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** An Instagram handle links to the profile, an email to a new message; anything else is plain text. */
function Contact({ value }: { value: string }) {
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    return (
      <a href={`mailto:${value}`} className="underline">
        {value}
      </a>
    );
  }
  const handle = value.replace(/^@/, "");
  if (/^[a-z0-9._]{1,30}$/i.test(handle)) {
    return (
      <a href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer" className="underline">
        @{handle}
      </a>
    );
  }
  return <span>{value}</span>;
}

async function FeedbackList({ searchParams }: { searchParams: PageProps<"/admin/feedback">["searchParams"] }) {
  const { supabase } = await requireAdmin();
  const { type } = await searchParams;
  const filter: FeedbackType | null = isFeedbackType(type) ? type : null;

  let query = supabase
    .from("feedback")
    .select("id, created_at, type, message, contact, event_id, page_url, user_agent, done, events(name)")
    .order("created_at", { ascending: false })
    .limit(SHOWN);
  if (filter) query = query.eq("type", filter);
  const [{ data: rows, error }, { data: all }] = await Promise.all([query, supabase.from("feedback").select("type, done")]);
  if (error) {
    return <p className="text-sm text-red-700">Couldn&apos;t load feedback: {error.message}</p>;
  }

  // How many of each type still need a look.
  const open = (key: FeedbackType | null) => (all ?? []).filter((r) => !r.done && (!key || r.type === key)).length;
  const tabs = [{ key: null, label: "All" }, ...ALL_FEEDBACK_TYPES];

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2" aria-label="Filter by type">
        {tabs.map((t) => {
          const active = filter === t.key;
          const count = open(t.key);
          return (
            <Link
              key={t.label}
              href={t.key ? `/admin/feedback?type=${t.key}` : "/admin/feedback"}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                active ? "bg-stone-900 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"
              }`}
            >
              {t.label}
              {count > 0 && <span className={`ml-1.5 ${active ? "text-stone-300" : "text-stone-500"}`}>{count}</span>}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500">
          {filter ? `No ${feedbackLabel(filter).toLowerCase()} feedback yet.` : "No feedback yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-xl border border-stone-200 bg-white p-4 ${r.done ? "opacity-55" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-xs font-semibold text-white">{feedbackLabel(r.type)}</span>
                  <span className="text-stone-500">{formatWhen(r.created_at)}</span>
                </div>
                <DoneToggle id={r.id} done={r.done} />
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-stone-900">{r.message}</p>

              <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm text-stone-600 sm:grid-cols-[auto_1fr]">
                {r.event_id && (
                  <>
                    <dt className="font-medium text-stone-500">Event</dt>
                    <dd>
                      <a href={`/events/${r.event_id}`} target="_blank" rel="noreferrer" className="underline">
                        {r.events?.name ?? `#${r.event_id}`}
                      </a>
                    </dd>
                  </>
                )}
                <dt className="font-medium text-stone-500">Contact</dt>
                <dd className="break-all">{r.contact ? <Contact value={r.contact} /> : <span className="text-stone-400">None left</span>}</dd>
                {r.page_url && (
                  <>
                    <dt className="font-medium text-stone-500">Page</dt>
                    <dd className="truncate">
                      <a href={r.page_url} target="_blank" rel="noreferrer" className="underline">
                        {r.page_url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                      </a>
                    </dd>
                  </>
                )}
                {r.user_agent && (
                  <>
                    <dt className="font-medium text-stone-500">Browser</dt>
                    <dd className="truncate text-xs leading-5 text-stone-500" title={r.user_agent}>
                      {r.user_agent}
                    </dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
      {rows.length === SHOWN && <p className="text-sm text-stone-500">Showing the newest {SHOWN}.</p>}
    </div>
  );
}
