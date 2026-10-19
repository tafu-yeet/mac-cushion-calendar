"use client";

import { useActionState, useState } from "react";

import { CATEGORIES } from "@/lib/categories";
import { formatWhen, weekdayOf } from "@/lib/time";

import { reviewEvent } from "./actions";
import type { Conflict, QueueEvent } from "./queue-types";

const input =
  "w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none disabled:bg-stone-100 disabled:text-stone-400";
const label = "flex flex-col gap-1 text-xs font-medium text-stone-600";

export function EventCard({ event, siblingIds }: { event: QueueEvent; siblingIds: number[] }) {
  const [state, action, pending] = useActionState(reviewEvent, null);
  const [date, setDate] = useState(event.startDate);
  const [timeUnknown, setTimeUnknown] = useState(!event.startTimeKnown);
  const [hasFood, setHasFood] = useState(event.hasFreeFood);
  const [cost, setCost] = useState(event.cost);

  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="grid gap-5 p-4 md:grid-cols-[260px_1fr]">
        <PostColumn event={event} />

        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="sibling_ids" value={siblingIds.join(",")} />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <SourceBadge source={event.source} />
            {event.flags.map((f) => (
              <span key={f} className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-900">
                {FLAG_LABELS[f] ?? f}
              </span>
            ))}
            {event.autoApproved && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-900">auto-approved</span>
            )}
            <ConfidenceBadge value={event.confidence} />
            {event.model && <span className="text-stone-500">read by {event.model}</span>}
          </div>

          {event.conflicts.length > 0 && <Conflicts conflicts={event.conflicts} pending={pending} />}

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
              Cost
              <select name="cost" value={cost} onChange={(e) => setCost(e.target.value)} className={input}>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="unknown">Not sure</option>
              </select>
            </label>
            <label className={label}>
              Price
              <input name="price" defaultValue={event.price ?? ""} disabled={cost !== "paid"} placeholder="e.g. $15" className={input} />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="event_type" value={event.eventType} />
            <label className={label}>
              Category
              <select name="category" defaultValue={event.category} className={input}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
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

const FLAG_LABELS: Record<string, string> = {
  instagram_post_deleted: "Instagram post deleted (event kept)",
  rubric_missing: "No longer on Rubric (event kept)",
  changed_on_instagram: "Instagram says it changed",
};

const FIELD_LABELS: Record<string, string> = {
  starts_at: "Start", ends_at: "End", location: "Place", cost: "Cost", price: "Price", has_free_food: "Free food",
};

/** Where the event came from: Instagram, Rubric (the MSU's club platform), or both. */
function SourceBadge({ source }: { source: QueueEvent["source"] }) {
  const [label, tone] =
    source === "both"
      ? ["Both", "bg-violet-600 text-white"]
      : source === "rubric"
        ? ["Rubric", "bg-violet-100 text-violet-900"]
        : ["IG", "bg-pink-100 text-pink-900"];
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${tone}`}>{label}</span>;
}

function showValue(field: string, value: Conflict["rubric"]): string {
  if (value === null || value === "") return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (field === "starts_at" || field === "ends_at") return formatWhen(value);
  return value;
}

/** Rubric and Instagram disagree: both values side by side, and the person picks. */
function Conflicts({ conflicts, pending }: { conflicts: Conflict[]; pending: boolean }) {
  const button = "rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm">
      <p className="font-medium text-violet-950">Rubric and Instagram disagree — nothing was changed:</p>
      {conflicts.map((c) => (
        <div key={c.field} className="grid gap-1 sm:grid-cols-[5rem_1fr_1fr] sm:items-center">
          <span className="text-xs font-semibold text-violet-900">{FIELD_LABELS[c.field] ?? c.field}</span>
          <button type="submit" name="intent" value={`use_rubric:${c.field}`} disabled={pending}
            className={`${button} bg-white text-left ring-1 ring-violet-300 hover:bg-violet-100`}>
            Use Rubric: <span className="font-normal">{showValue(c.field, c.rubric)}</span>
          </button>
          <button type="submit" name="intent" value={`keep_instagram:${c.field}`} disabled={pending}
            className={`${button} bg-white text-left ring-1 ring-pink-300 hover:bg-pink-50`}>
            Keep Instagram: <span className="font-normal">{showValue(c.field, c.instagram)}</span>
          </button>
          {c.why && <span className="text-xs text-violet-800 sm:col-span-3">{c.why}</span>}
        </div>
      ))}
    </div>
  );
}

function PostColumn({ event }: { event: QueueEvent }) {
  if (!event.postId) return <RubricColumn event={event} />;
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
        {event.ticketUrl && (
          <a href={event.ticketUrl} target="_blank" rel="noreferrer" className="font-medium text-violet-800 hover:underline">
            Rubric listing ↗
          </a>
        )}
      </div>
    </div>
  );
}

/** An event only Rubric lists: its image and description in place of a post. */
function RubricColumn({ event }: { event: QueueEvent }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="font-semibold leading-tight">{event.clubName}</p>
        <p className="text-xs text-stone-500">@{event.clubUsername} · listed on Rubric, no Instagram post</p>
      </div>
      {event.rubricImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.rubricImageUrl} alt="Rubric image" className="w-full rounded-lg border border-stone-200" />
      ) : (
        <div className="rounded-lg bg-stone-100 px-3 py-6 text-center text-xs text-stone-500">No image on Rubric</div>
      )}
      <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-violet-50 p-2 text-xs leading-relaxed text-stone-700">
        {event.description || "(no description)"}
      </p>
      {event.ticketUrl && (
        <a href={event.ticketUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-violet-800 hover:underline">
          Open on Rubric ↗
        </a>
      )}
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
