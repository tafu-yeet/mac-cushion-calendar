"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

import { updateMember } from "@/components/member-provider";
import { ALERT, BUTTON, BUTTON_LIGHT, CARD, INPUT, LABEL, LINK_BUTTON, NOTE } from "@/components/member-styles";
import { campus } from "@/lib/campus";
import type { FoundBlock } from "@/lib/ics-import";
import {
  GRID,
  activeBlocks,
  blocksFromCells,
  cellKey,
  cellsFromBlocks,
  clockLabel,
  mergeBlocks,
  type BusyBlock,
  WEEKDAY_NAMES,
} from "@/lib/schedule";
import { formatDay } from "@/lib/time";

import { saveSchedule } from "../actions";

const PRIVACY = "We save only the weekly times you're busy (day, start, end) until the term ends: no course names, rooms or file.";

type Props = { saved: BusyBlock[]; today: string; termEnd: string; termName: string | null };

/** A calendar file to read, or the tap grid: either way, only weekly busy times are saved. */
export function ScheduleEditor({ saved, today, termEnd, termName }: Props) {
  const current = activeBlocks(saved, today);
  const [until, setUntil] = useState(current[0]?.termEndsOn ?? termEnd);
  const [cells, setCells] = useState(() => cellsFromBlocks(current));
  const [found, setFound] = useState<(FoundBlock & { keep: boolean })[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = (blocks: BusyBlock[], source: "ics" | "grid") => {
    setStatus(null);
    start(async () => {
      const result = await saveSchedule(blocks, source);
      if (!result.ok) return setStatus({ ok: false, text: result.error });
      const kept = mergeBlocks(blocks);
      updateMember((m) => ({ ...m, busy: kept }));
      setStatus({ ok: true, text: kept.length ? "Saved." : "Your schedule is cleared." });
    });
  };

  const readFile = async (file: File) => {
    setFileError(null);
    setFound(null);
    if (file.size > 2_000_000) return setFileError("That file is too big for a class calendar. Export just the one calendar.");
    try {
      const [{ weeklyBlocksFromIcs }, text] = await Promise.all([import("@/lib/ics-import"), file.text()]);
      const { blocks, events } = weeklyBlocksFromIcs(text, { today, termEnd: until });
      if (!blocks.length) {
        return setFileError(
          events
            ? `We read ${events} events but none repeat weekly, so there's nothing to save. Tap your classes in below instead.`
            : "There are no timed events in that file. Tap your classes in below instead.",
        );
      }
      setFound(blocks.map((b) => ({ ...b, keep: true })));
    } catch {
      setFileError("That doesn't look like a calendar (.ics) file. Tap your classes in below instead.");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className={NOTE}>{PRIVACY}</p>

      <section className={CARD} aria-labelledby="from-file">
        <h2 id="from-file" className="font-display text-xl font-semibold lowercase">
          from a calendar file
        </h2>
        <p className="text-sm leading-relaxed text-maroon/85">
          {campus.scheduleExport.note}{" "}
          <a href={campus.scheduleExport.toolUrl} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
            {campus.scheduleExport.toolName}
          </a>
        </p>
        <label className={`${BUTTON_LIGHT} cursor-pointer`}>
          Choose a .ics file
          <input
            type="file"
            accept=".ics,text/calendar"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-maroon/75">Read on your phone: the file never leaves it.</p>
        {fileError && (
          <p role="alert" className={ALERT}>
            {fileError}
          </p>
        )}
        {found && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold">
              Found {found.length} weekly block{found.length === 1 ? "" : "s"}. Untick any that aren&apos;t classes:
            </p>
            <ul className="flex flex-col gap-1">
              {found.map((b, i) => (
                <li key={`${b.weekday}-${b.start}-${b.label}`}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl px-1 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={b.keep}
                      onChange={() => setFound(found.map((f, j) => (j === i ? { ...f, keep: !f.keep } : f)))}
                      className="mt-0.5 size-5 shrink-0 accent-maroon"
                    />
                    <span>
                      <span className="font-semibold">
                        {WEEKDAY_NAMES[b.weekday - 1].slice(0, 3)} {clockLabel(b.start)}–{clockLabel(b.end)}
                      </span>{" "}
                      <span className="text-maroon/80">
                        {b.label} · until {formatDay(b.termEndsOn, "short", today)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending || !found.some((b) => b.keep)}
              onClick={() => {
                const keep = found.filter((b) => b.keep).map(({ weekday, start, end, termEndsOn }) => ({ weekday, start, end, termEndsOn }));
                save(keep, "ics");
                setCells(cellsFromBlocks(keep));
                setFound(null);
              }}
              className={BUTTON}
            >
              Save these {found.filter((b) => b.keep).length}
            </button>
          </div>
        )}
      </section>

      <section className={CARD} aria-labelledby="by-hand">
        <h2 id="by-hand" className="font-display text-xl font-semibold lowercase">
          or tap your classes
        </h2>
        <p className="text-sm text-maroon/85">
          Tap the half hours you&apos;re in class. To fill a few at once, hold a square, then slide.
        </p>
        <TapGrid cells={cells} onChange={setCells} />
        <label className={LABEL}>
          Until {termName ? <span className="font-normal text-maroon/75">(the last day of {termName} classes)</span> : null}
          <input type="date" value={until} min={today} onChange={(e) => e.target.value && setUntil(e.target.value)} className={INPUT} />
        </label>
        <button type="button" disabled={pending} onClick={() => save(blocksFromCells(cells, until), "grid")} className={BUTTON}>
          {pending ? "Saving…" : "Save schedule"}
        </button>
      </section>

      {status && (
        <p role="status" className={status.ok ? NOTE : ALERT}>
          {status.text}{" "}
          {status.ok && cells.size > 0 && (
            <Link href="/?fits=1" className="font-semibold underline underline-offset-2">
              See what fits
            </Link>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-x-5">
        <Link href="/account" className={LINK_BUTTON}>
          Back to your account
        </Link>
        {saved.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setCells(new Set());
              save([], "grid");
            }}
            className={LINK_BUTTON}
          >
            Remove my schedule
          </button>
        )}
      </div>
    </div>
  );
}

const ROWS = Array.from({ length: (GRID.lastMinute - GRID.firstMinute) / GRID.step }, (_, i) => GRID.firstMinute + i * GRID.step);
const HOLD_MS = 250;
const MOVE_PX = 8;

/**
 * Half-hour squares, Monday to Friday (weekends a tap away). A tap toggles one; on a phone,
 * holding a square then sliding paints a run (a plain swipe still scrolls the page); with a
 * mouse, press and drag.
 */
function TapGrid({ cells, onChange }: { cells: Set<string>; onChange: (cells: Set<string>) => void }) {
  const [weekend, setWeekend] = useState(() => [...cells].some((k) => Number(k.split(":")[0]) >= 6));
  const days = weekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const grid = useRef<HTMLDivElement>(null);
  // The squares as of the last render, for the touch listeners (set up once).
  const latest = useRef(cells);
  useLayoutEffect(() => {
    latest.current = cells;
  }, [cells]);

  // Painting: whether this gesture adds or removes, and the squares it already changed.
  const paint = useRef<{ adding: boolean; touched: Set<string> } | null>(null);

  const keyAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-cell]")?.dataset.cell;

  const paintAt = (key: string | undefined) => {
    const p = paint.current;
    if (!key || !p || p.touched.has(key)) return;
    p.touched.add(key);
    const next = new Set(latest.current);
    if (p.adding) next.add(key);
    else next.delete(key);
    latest.current = next; // the next square in this slide builds on this one, before React re-renders
    onChange(next);
  };
  const begin = (key: string) => {
    paint.current = { adding: !latest.current.has(key), touched: new Set() };
    paintAt(key);
  };

  // Touch needs a non-passive listener to stop the page scrolling once a hold turns into painting.
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let origin: { x: number; y: number; key: string } | null = null;
    let moved = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const key = keyAt(t.clientX, t.clientY);
      if (!key || e.touches.length > 1) return;
      origin = { x: t.clientX, y: t.clientY, key };
      moved = false;
      timer = setTimeout(() => {
        begin(key);
        navigator.vibrate?.(10);
      }, HOLD_MS);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (paint.current) {
        e.preventDefault();
        paintAt(keyAt(t.clientX, t.clientY));
      } else if (origin && Math.hypot(t.clientX - origin.x, t.clientY - origin.y) > MOVE_PX) {
        moved = true; // a scroll, not a tap
        clearTimeout(timer);
      }
    };
    const onEnd = (e: TouchEvent) => {
      clearTimeout(timer);
      if (!paint.current && origin && !moved) {
        e.preventDefault(); // no click after: the tap is handled here
        begin(origin.key);
      }
      paint.current = null;
      origin = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // begin and paintAt read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={grid}
        role="grid"
        aria-label="Weekly class times"
        className="grid select-none gap-px overflow-hidden rounded-2xl bg-maroon/15 text-xs"
        style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
        onPointerUp={() => (paint.current = null)}
        onPointerLeave={() => (paint.current = null)}
      >
        <div role="row" className="contents">
          <span className="bg-panel" />
          {days.map((d) => (
            <span key={d} role="columnheader" className="bg-panel py-1.5 text-center font-semibold">
              {WEEKDAY_NAMES[d - 1].slice(0, 3)}
            </span>
          ))}
        </div>
        {ROWS.map((minute) => (
          <div key={minute} role="row" className="contents">
            <span role="rowheader" className="bg-panel pr-1.5 text-right leading-7 text-maroon/75">
              {minute % 60 === 0 ? clockLabel(minute).replace(" ", " ") : ""}
            </span>
            {days.map((d) => {
              const key = cellKey(d, minute);
              const on = cells.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  data-cell={key}
                  aria-selected={on}
                  aria-label={`${WEEKDAY_NAMES[d - 1]} ${clockLabel(minute)}`}
                  onPointerDown={(e) => {
                    if (e.pointerType === "touch") return; // handled by the touch listeners
                    e.preventDefault();
                    begin(key);
                  }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "touch" && e.buttons === 1) paintAt(key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    begin(key);
                    paint.current = null;
                  }}
                  className={`h-7 ${on ? "bg-maroon" : minute % 60 === 0 ? "bg-white" : "bg-white/70"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setWeekend((w) => !w)} className={LINK_BUTTON}>
          {weekend ? "Hide the weekend" : "Show the weekend"}
        </button>
        {cells.size > 0 && (
          <button type="button" onClick={() => onChange(new Set())} className={LINK_BUTTON}>
            Clear the grid
          </button>
        )}
      </div>
    </div>
  );
}
