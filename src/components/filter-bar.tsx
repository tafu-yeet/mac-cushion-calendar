"use client";

import { useState } from "react";

import { CATEGORIES, type Category } from "@/lib/categories";
import {
  DAYS,
  DEFAULT_FILTERS,
  FILTER_KEYS,
  TIME_PRESETS,
  filterParams,
  isNarrowed,
  sameFilters,
  type Day,
  type Filters,
  type TimePreset,
} from "@/lib/filters";

import { SearchIcon, UtensilsIcon } from "./icons";

/**
 * Filters that start from the URL and write every change back to it without a
 * page load, so results update as you type and the address can be shared.
 */
export function useFilters(fromUrl: Filters) {
  const [filters, setFilters] = useState(fromUrl);
  const [lastFromUrl, setLastFromUrl] = useState(fromUrl);
  // A link to this page with other filters (like the nav) arrives as new props.
  if (!sameFilters(fromUrl, lastFromUrl)) {
    setLastFromUrl(fromUrl);
    if (!sameFilters(fromUrl, filters)) setFilters(fromUrl);
  }

  const update = (change: Partial<Filters>) => {
    const next = { ...filters, ...change };
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    FILTER_KEYS.forEach((key) => params.delete(key));
    Object.entries(filterParams(next)).forEach(([key, value]) => params.set(key, value));
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  };
  return [filters, update] as const;
}

type Update = (change: Partial<Filters>) => void;

/** Search, category and cost filters; with `showWhen`, also the day and "I'm free" time window. */
export function FilterBar({ filters, update, showWhen = false }: { filters: Filters; update: Update; showWhen?: boolean }) {
  const toggleCategory = (key: Category) =>
    update({
      categories: filters.categories.includes(key) ? filters.categories.filter((c) => c !== key) : [...filters.categories, key],
    });

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Search events</span>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-maroon/50" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => update({ q: e.target.value })}
          placeholder="Search events, clubs, places, food…"
          className="w-full rounded-full bg-panel py-2.5 pl-10 pr-4 text-base ring-1 ring-maroon/20 placeholder:text-maroon/45 focus:outline-none focus:ring-2 focus:ring-maroon sm:text-sm"
        />
      </label>

      {showWhen && (
        <>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Day">
            {(Object.keys(DAYS) as Day[]).map((day) => (
              <button
                key={day}
                type="button"
                role="radio"
                aria-checked={filters.day === day}
                onClick={() => update({ day })}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  filters.day === day ? "bg-maroon text-cream" : "text-maroon ring-1 ring-maroon/25 hover:bg-maroon/5"
                }`}
              >
                {DAYS[day]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-sm font-medium text-maroon/75">I&apos;m free</span>
            <Chip active={!filters.time} onClick={() => update({ time: null })}>
              Any time
            </Chip>
            {(Object.keys(TIME_PRESETS) as TimePreset[]).map((key) => (
              <Chip key={key} active={filters.time === key} onClick={() => update({ time: key })}>
                {TIME_PRESETS[key].label}
              </Chip>
            ))}
            <Chip
              active={filters.time === "custom"}
              onClick={() => update({ time: "custom", from: filters.from || "14:00", to: filters.to || "17:00" })}
            >
              From… to…
            </Chip>
            {filters.time === "custom" && (
              <span className="flex items-center gap-1.5 text-sm text-maroon/75">
                <TimeInput label="From" value={filters.from} onChange={(from) => update({ from })} />
                to
                <TimeInput label="To" value={filters.to} onChange={(to) => update({ to })} />
              </span>
            )}
          </div>
        </>
      )}

      {/* Tags any event can have, whatever its type. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={filters.food} onClick={() => update({ food: !filters.food })} food>
          <UtensilsIcon className="size-3.5" />
          Free food
        </Chip>
        <Chip active={filters.freeEntry} onClick={() => update({ freeEntry: !filters.freeEntry })}>
          Free entry
        </Chip>
        <Chip active={filters.limited} onClick={() => update({ limited: !filters.limited })} describedBy="members-only-hint">
          Members-only too
        </Chip>
        {isNarrowed(filters) && (
          <button
            type="button"
            onClick={() => update({ ...DEFAULT_FILTERS, day: filters.day })}
            className="ml-1 text-sm font-semibold text-maroon underline underline-offset-2 hover:text-plum"
          >
            Clear filters
          </button>
        )}
      </div>
      <p id="members-only-hint" className="-mt-1.5 text-xs text-maroon/80">
        Events only for a club&apos;s members or one program are hidden unless you add them.
      </p>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm font-medium text-maroon/85">Type</span>
        <div className="-mr-4 flex gap-1.5 overflow-x-auto pr-4 pb-1 [scrollbar-width:none] sm:mr-0 sm:flex-wrap sm:pr-0 [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map((c) => (
            <Chip key={c.key} active={filters.categories.includes(c.key)} onClick={() => toggleCategory(c.key)}>
              <span className={`size-2.5 rounded-full ${c.tone.swatch}`} />
              {c.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  food = false,
  describedBy,
  children,
}: {
  active: boolean;
  onClick: () => void;
  food?: boolean;
  describedBy?: string;
  children: React.ReactNode;
}) {
  const on = food ? "bg-gold text-maroon ring-gold" : "bg-maroon text-cream ring-maroon";
  const off = food ? "bg-gold/25 text-maroon ring-gold hover:bg-gold/40" : "text-maroon ring-maroon/25 hover:bg-maroon/5";
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-describedby={describedBy}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors ${active ? on : off}`}
    >
      {children}
    </button>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="rounded-full bg-panel px-3 py-1 text-base ring-1 ring-maroon/25 sm:text-sm"
    />
  );
}
