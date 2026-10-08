"use client";

import { useActionState, useState } from "react";

import { formatWhen, weekdayOf } from "@/lib/time";

import { reviewEvent } from "./actions";
import type { QueueEvent } from "./queue-types";

const input =
  "w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none disabled:bg-stone-100 disabled:text-stone-400";
const label = "flex flex-col gap-1 text-xs font-medium text-stone-600";

export function EventCard({ event, siblingIds }: { event: QueueEvent; siblingIds: number[] }) {
  const [state, action, pending] = useActionState(reviewEvent, null);
  const [date, setDate] = useState(event.startDate);
  const [timeUnknown, setTimeUnknown] = useState(!event.startTimeKnown);
  const [hasFood, setHasFood] = useState(event.hasFreeFood);

  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="grid gap-5 p-4 md:grid-cols-[260px_1fr]">
        <PostColumn event={event} />

        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="sibling_ids" value={siblingIds.join(",")} />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {event.autoApproved && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-900">auto-approved</span>
            )}
            <ConfidenceBadge value={event.confidence} />
            {event.model && <span className="text-stone-500">read by {event.model}</span>}
          </div>

          {event.reviewNotes.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {event.reviewNotes.map((note) => (
                <li key={note}>⚠ {note}</li>
              ))}
            </ul>
          )}

          <label className={label}>
            Event name
            <input name="name" defaultValue={event.name} required className={input} />
          </label>

          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
            <label className="flex items-center gap-2 pb-1.5 text-sm font-medium">
              <input
                type="checkbox"
                name="has_free_food"
                checked={hasFood}
                onChange={(e) => setHasFood(e.target.checked)}
                className="size-4 accent-emerald-600"
              />
              Free food
            </label>
            <label className={label}>
              What food
              <input name="food_description" defaultValue={event.foodDescription ?? ""} className={input} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className={label}>
              <span>
                Date{" "}
                {date && <span className="ml-1 rounded bg-stone-900 px-1.5 py-0.5 text-[11px] text-white">{weekdayOf(date)}</span>}
              </span>
              <input type="date" name="start_date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </label>
            <label className={label}>
              Start time
              <input type="time" name="start_time" defaultValue={event.startTime} disabled={timeUnknown} className={input} />
            </label>
            <label className={label}>
              End time
              <input type="time" name="end_time" defaultValue={event.endTime} className={input} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="time_unknown"
              checked={timeUnknown}
              onChange={(e) => setTimeUnknown(e.target.checked)}
              className="size-4"
            />
            Time unknown (shows as &ldquo;time TBD&rdquo;)
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Location
              <input name="location" defaultValue={event.location ?? ""} className={input} />
            </label>
            <label className={label}>
              Hosted by (if not {event.clubName})
              <input name="hosted_by" defaultValue={event.hostedBy ?? ""} placeholder="e.g. Hillel McMaster (@hillelmcmaster)" className={input} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
            <label className="flex items-center gap-2 pb-1.5 text-sm font-medium">
              <input type="checkbox" name="open_to_all" defaultChecked={event.openToAll} className="size-4" />
              Open to all
            </label>
            <label className={label}>
              Type
              <input name="event_type" defaultValue={event.eventType} className={input} />
            </label>
            <label className={label}>
              Tags (comma-separated)
              <input name="tags" defaultValue={event.tags.join(", ")} className={input} />
            </label>
          </div>

          {event.reason && <p className="text-xs text-stone-500">Model&apos;s reasoning: {event.reason}</p>}
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}

          <Buttons status={event.status} pending={pending} duplicates={siblingIds.length} />
        </form>
      </div>
    </article>
  );
}

function PostColumn({ event }: { event: QueueEvent }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="font-semibold leading-tight">{event.clubName}</p>
        <a
          href={`https://www.instagram.com/${event.clubUsername}/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-stone-500 hover:underline"
        >
          @{event.clubUsername}
        </a>
        {event.hostedBy && (
          <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-900">
            Hosted by <span className="font-medium">{event.hostedBy}</span>
          </p>
        )}
      </div>
      {event.imageUrl ? (
        // Signed storage URLs change on every load, so skip next/image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt="Post image" className="w-full rounded-lg border border-stone-200" />
      ) : (
        <div className="rounded-lg bg-stone-100 px-3 py-6 text-center text-xs text-stone-500">No image saved</div>
      )}
      <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-stone-50 p-2 text-xs leading-relaxed text-stone-700">
        {event.caption || "(no caption)"}
      </p>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-stone-500">
        {event.postedAt && <span>Posted {formatWhen(event.postedAt)}</span>}
        {event.permalink && (
          <a href={event.permalink} target="_blank" rel="noreferrer" className="font-medium text-stone-700 hover:underline">
            Open on Instagram ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone =
    value < 0.5 ? "bg-red-100 text-red-800" : value < 0.8 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800";
  return <span className={`rounded-full px-2 py-0.5 font-medium ${tone}`}>confidence {Math.round(value * 100)}%</span>;
}

function Buttons({ status, pending, duplicates }: { status: string; pending: boolean; duplicates: number }) {
  const base = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  const approve = `${base} bg-emerald-600 text-white hover:bg-emerald-700`;
  const neutral = `${base} border border-stone-300 bg-white text-stone-800 hover:bg-stone-100`;
  const reject = `${base} border border-red-200 bg-white text-red-700 hover:bg-red-50`;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {status !== "approved" && (
        <button type="submit" name="intent" value="approve" disabled={pending} className={approve}>
          Approve
        </button>
      )}
      {status === "pending" && duplicates > 0 && (
        <button type="submit" name="intent" value="approve_group" disabled={pending} className={approve}>
          Approve &amp; reject {duplicates} duplicate{duplicates === 1 ? "" : "s"}
        </button>
      )}
      <button type="submit" name="intent" value="save" disabled={pending} className={neutral}>
        Save edits
      </button>
      {status !== "pending" && (
        <button type="submit" name="intent" value="pending" disabled={pending} className={neutral}>
          Back to queue
        </button>
      )}
      {status !== "rejected" && (
        <button type="submit" name="intent" value="reject" disabled={pending} className={reject}>
          Reject
        </button>
      )}
      {pending && <span className="self-center text-sm text-stone-500">Saving…</span>}
    </div>
  );
}
