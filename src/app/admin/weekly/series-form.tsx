"use client";

import Link from "next/link";
import { startTransition, useActionState, useTransition } from "react";

import { saveSeries, setSeriesActive } from "./actions";

export type SeriesValues = {
  id: number | null;
  club: string; // @handle
  name: string;
  category: string;
  days: number[];
  start_time: string; // HH:MM
  end_time: string;
  location: string;
  has_free_food: boolean;
  food_description: string;
  cost: string;
  open_to_all: boolean;
  description: string;
  source_url: string;
  starts_on: string;
  ends_on: string;
  skip_dates: string; // one per line
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CATEGORIES = ["social", "sports", "arts", "learn", "give", "meetings", "other"];
const input = "rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm";
const label = "flex flex-col gap-1 text-sm font-medium text-stone-700";

/** Add a weekly program, or edit one. */
export function SeriesForm({ values, clubs }: { values: SeriesValues; clubs: { handle: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveSeries, null);
  return (
    <form
      // Sent by hand, not as a form action: React clears an action's form afterwards, losing what was typed on an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4"
    >
      <h2 className="font-semibold">{values.id ? `Edit “${values.name}”` : "Add a weekly program"}</h2>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Club (@handle)
          <input name="club" list="weekly-clubs" required defaultValue={values.club} className={input} placeholder="@msu_fcc" />
          <datalist id="weekly-clubs">
            {clubs.map((c) => (
              <option key={c.handle} value={`@${c.handle}`}>
                {c.name}
              </option>
            ))}
          </datalist>
        </label>
        <label className={label}>
          Name
          <input name="name" required defaultValue={values.name} className={input} placeholder="Soup and Bread" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-stone-700">Days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="days" value={i + 1} defaultChecked={values.days.includes(i + 1)} />
              {d}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={label}>
          Starts at
          <input type="time" name="start_time" required defaultValue={values.start_time} className={input} />
        </label>
        <label className={label}>
          Ends at <span className="font-normal text-stone-500">(optional)</span>
          <input type="time" name="end_time" defaultValue={values.end_time} className={input} />
        </label>
        <label className={label}>
          First day
          <input type="date" name="starts_on" required defaultValue={values.starts_on} className={input} />
        </label>
        <label className={label}>
          Last day
          <input type="date" name="ends_on" required defaultValue={values.ends_on} className={input} />
        </label>
      </div>

      <label className={label}>
        Place
        <input name="location" defaultValue={values.location} className={input} placeholder="Food Collective Centre, 3rd floor, The Hub" />
      </label>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input type="checkbox" name="has_free_food" defaultChecked={values.has_free_food} />
          Free food
        </label>
        <input name="food_description" defaultValue={values.food_description} className={input} placeholder="a bowl of soup and bread" aria-label="What food" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Type
          <select name="category" defaultValue={values.category} className={input}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Cost
          <select name="cost" defaultValue={values.cost} className={input}>
            <option value="free">free</option>
            <option value="paid">paid</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm font-medium text-stone-700">
          <input type="checkbox" name="open_to_all" defaultChecked={values.open_to_all} />
          Open to everyone
        </label>
      </div>

      <label className={label}>
        Description
        <textarea name="description" rows={2} defaultValue={values.description} className={input} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Announcement link <span className="font-normal text-stone-500">(the post or page)</span>
          <input name="source_url" type="url" defaultValue={values.source_url} className={input} placeholder="https://www.instagram.com/p/…" />
        </label>
        <label className={label}>
          Skipped dates <span className="font-normal text-stone-500">(one per line: 2026-11-11, or 2026-11-09 to 2026-11-13)</span>
          <textarea name="skip_dates" rows={2} defaultValue={values.skip_dates} className={input} />
        </label>
      </div>

      {state && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60">
          {pending ? "Saving…" : values.id ? "Save changes" : "Add program"}
        </button>
        {values.id && (
          <Link href="/admin/weekly" className="text-sm text-stone-600 underline">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}

/** Stop a program (its upcoming days come off the site) or start it again. */
export function ActiveToggle({ id, active }: { id: number; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setSeriesActive(id, !active))}
      className="rounded-md px-2 py-1 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100 disabled:opacity-60"
    >
      {active ? "Stop" : "Start again"}
    </button>
  );
}
