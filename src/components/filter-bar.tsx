"use client";

import { useEffect, useRef, useState } from "react";

import { CATEGORIES, categoryOf, type Category } from "@/lib/categories";
import {
  DAYS,
  DEFAULT_FILTERS,
  FILTER_KEYS,
  TIME_PRESETS,
  filterParams,
  isNarrowed,
  sameFilters,
  settleDay,
  type Day,
  type Filters,
  type TimePreset,
} from "@/lib/filters";
import { addDays, formatDay } from "@/lib/time";

import { DayPicker, type DayCounts } from "./day-picker";
import { ChevronIcon, ClockIcon, SearchIcon, TodayIcon, UtensilsIcon } from "./icons";

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
type Menu = "day" | "time" | "type" | "more";

/**
 * Search, then one dropdown per kind of filter, each labelled with what's
 * chosen: the day (a preset or a date from the calendar) and "I'm free" time
 * window when `when` is given, event types, and more (cost, members-only).
 * Free food stays a one-tap chip. The open menu's options appear under the row.
 */
export function FilterBar({
  filters,
  update,
  when,
}: {
  filters: Filters;
  update: Update;
  when?: { today: string; counts: DayCounts };
}) {
  const [open, setOpen] = useState<Menu | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  // A tap or click anywhere outside the filters closes the open menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  /** Closes the open menu and puts focus back on its button. */
  const close = () => {
    if (open) document.getElementById(`filter-${open}-button`)?.focus();
    setOpen(null);
  };
  const toggle = (menu: Menu) => setOpen(open === menu ? null : menu);

  const toggleCategory = (key: Category) =>
    update({
      categories: filters.categories.includes(key) ? filters.categories.filter((c) => c !== key) : [...filters.categories, key],
    });
  const moreCount = Number(filters.freeEntry) + Number(filters.limited);

  return (
    <div ref={bar} className="flex flex-col gap-3" onKeyDown={(e) => {
        if (e.key === "Escape" && open) close();
      }}>
      <label className="relative block" data-tour="search">
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

      <div className="flex flex-wrap items-center gap-1.5">
        {when && (
          <>
            <MenuButton menu="day" name="Day" open={open} onToggle={toggle} active={filters.day !== "today"} icon={<TodayIcon className="size-4" />}>
              {filters.day === "date" ? formatDay(filters.date, "short", when.today) : DAYS[filters.day]}
            </MenuButton>
            <MenuButton menu="time" name="Time" open={open} onToggle={toggle} active={!!filters.time} icon={<ClockIcon className="size-4" />}>
              {timeLabel(filters)}
            </MenuButton>
          </>
        )}
        <Chip active={filters.food} onClick={() => update({ food: !filters.food })} food tourId="food">
          <UtensilsIcon className="size-3.5" />
          Free food
        </Chip>
        <MenuButton menu="type" name="Type" open={open} onToggle={toggle} active={filters.categories.length > 0}>
          {filters.categories.length === 0
            ? "All types"
            : filters.categories.length === 1
              ? categoryOf(filters.categories[0]).label
              : `${filters.categories.length} types`}
        </MenuButton>
        <MenuButton menu="more" name="" open={open} onToggle={toggle} active={moreCount > 0}>
          More
          {moreCount > 0 && (
            <>
              <span aria-hidden="true" className="rounded-full bg-cream px-1.5 text-xs font-bold text-maroon">
                {moreCount}
              </span>
              <span className="sr-only">, {moreCount} on</span>
            </>
          )}
        </MenuButton>
        {isNarrowed(filters) && (
          <button
            type="button"
            onClick={() => update({ ...DEFAULT_FILTERS, day: filters.day, date: filters.date })}
            className="ml-1 text-sm font-semibold text-maroon underline underline-offset-2 hover:text-plum"
          >
            Clear filters
          </button>
        )}
      </div>

      {open === "day" && when && (
        <Panel menu="day" title="Which day are you free?" onDone={close}>
          <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Day">
            {(Object.keys(DAYS) as Day[]).map((day) => (
              <Option
                key={day}
                checked={filters.day === day}
                onClick={() => {
                  update({ day, date: "" });
                  close();
                }}
              >
                {DAYS[day]}
              </Option>
            ))}
          </div>
          <DayPicker
            today={when.today}
            selected={
              filters.day === "date"
                ? filters.date
                : filters.day === "today"
                  ? when.today
                  : filters.day === "tomorrow"
                    ? addDays(when.today, 1)
                    : null
            }
            counts={when.counts}
            onPick={(date) => {
              // Today and tomorrow light up their own options (and keep links short).
              update(settleDay({ ...filters, day: "date", date }, when.today));
              close();
            }}
          />
        </Panel>
      )}

      {open === "time" && (
        <Panel menu="time" title="When are you free?" onDone={close}>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Time">
            <Option
              checked={!filters.time}
              onClick={() => {
                update({ time: null });
                close();
              }}
            >
              Any time
            </Option>
            {(Object.keys(TIME_PRESETS) as TimePreset[]).map((key) => (
              <Option
                key={key}
                checked={filters.time === key}
                onClick={() => {
                  update({ time: key });
                  close();
                }}
              >
                {TIME_PRESETS[key].label}
              </Option>
            ))}
            <Option
              checked={filters.time === "custom"}
              onClick={() => update({ time: "custom", from: filters.from || "14:00", to: filters.to || "17:00" })}
            >
              From… to…
            </Option>
          </div>
          {filters.time === "custom" && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-maroon/80">
              <TimeInput label="From" value={filters.from} onChange={(from) => update({ from })} />
              to
              <TimeInput label="To" value={filters.to} onChange={(to) => update({ to })} />
            </p>
          )}
        </Panel>
      )}

      {open === "type" && (
        <Panel menu="type" title="What kind of event?" onDone={close}>
          <div className="flex flex-wrap gap-1.5">
            <Chip active={filters.categories.length === 0} onClick={() => update({ categories: [] })}>
              All types
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c.key} active={filters.categories.includes(c.key)} onClick={() => toggleCategory(c.key)}>
                <span className={`size-2.5 rounded-full ${c.tone.swatch}`} />
                {c.label}
              </Chip>
            ))}
          </div>
        </Panel>
      )}

      {open === "more" && (
        <Panel menu="more" title="More filters" onDone={close}>
          <div className="flex flex-col gap-3">
            <Toggle
              active={filters.freeEntry}
              onClick={() => update({ freeEntry: !filters.freeEntry })}
              label="Free entry"
              hint="Only events that cost nothing to get into."
              hintId="free-entry-hint"
            />
            <Toggle
              active={filters.limited}
              onClick={() => update({ limited: !filters.limited })}
              label="Members-only too"
              hint="Events only for a club's members or one program are hidden unless you add them."
              hintId="members-only-hint"
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

/** "Any time", "Evening", or "2 PM–5 PM". */
function timeLabel(f: Filters): string {
  if (!f.time) return "Any time";
  if (f.time !== "custom") return TIME_PRESETS[f.time].label;
  const clock = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 || h === 24 ? "AM" : "PM"}`;
  };
  return `${clock(f.from)}–${clock(f.to)}`;
}

/** A dropdown's button: what's chosen, filled in maroon once it narrows the list. */
function MenuButton({
  menu,
  name,
  open,
  onToggle,
  active,
  icon,
  children,
}: {
  menu: Menu;
  name: string; // read before the choice by screen readers: "Day: Tomorrow"
  open: Menu | null;
  onToggle: (menu: Menu) => void;
  active: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const expanded = open === menu;
  return (
    <button
      id={`filter-${menu}-button`}
      data-tour={menu}
      type="button"
      aria-expanded={expanded}
      aria-controls={`filter-${menu}`}
      onClick={() => onToggle(menu)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors ${
        active ? "bg-maroon text-cream ring-maroon" : expanded ? "bg-maroon/5 text-maroon ring-maroon/45" : "text-maroon ring-maroon/25 hover:bg-maroon/5"
      }`}
    >
      {icon}
      {name && <span className="sr-only">{name}: </span>}
      {children}
      <ChevronIcon className={`size-3.5 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`} />
    </button>
  );
}

/** The open dropdown's options, under the row of buttons. */
function Panel({ menu, title, onDone, children }: { menu: Menu; title: string; onDone: () => void; children: React.ReactNode }) {
  return (
    <div id={`filter-${menu}`} className="rounded-[24px] bg-canvas p-3 sm:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <p className="font-display text-base font-semibold">{title}</p>
        <button type="button" onClick={onDone} className="rounded-full px-2.5 py-0.5 text-sm font-semibold text-maroon underline-offset-2 hover:underline">
          Done
        </button>
      </div>
      {children}
    </div>
  );
}

/** One choice of several (a day, a time window). */
function Option({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors ${
        checked ? "bg-maroon text-cream ring-maroon" : "bg-panel text-maroon ring-maroon/25 hover:bg-butter/70"
      }`}
    >
      {children}
    </button>
  );
}

/** An on/off filter with a line saying what it does. */
function Toggle({ active, onClick, label, hint, hintId }: { active: boolean; onClick: () => void; label: string; hint: string; hintId: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Chip active={active} onClick={onClick} describedBy={hintId}>
        {label}
      </Chip>
      <p id={hintId} className="px-1 text-xs text-maroon/80">
        {hint}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  food = false,
  describedBy,
  tourId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  food?: boolean;
  describedBy?: string;
  tourId?: string; // what the site tour points at
  children: React.ReactNode;
}) {
  const on = food ? "bg-gold text-maroon ring-gold" : "bg-maroon text-cream ring-maroon";
  const off = food ? "bg-gold/25 text-maroon ring-gold hover:bg-gold/40" : "bg-panel text-maroon ring-maroon/25 hover:bg-maroon/5";
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-describedby={describedBy}
      data-tour={tourId}
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
