// The motion settings from src/app/motion.css, for animations started from code. Browser only.

type DurationToken =
  | "--motion-fast"
  | "--motion-base"
  | "--motion-slow"
  | "--motion-menu-in"
  | "--motion-menu-out"
  | "--motion-stagger"
  | "--motion-draw";
type ValueToken = "--ease-out" | "--ease-in-out" | "--ease-in" | "--motion-rise" | "--motion-stretch";

/** A value from motion.css, like "cubic-bezier(0.2, 0.8, 0.2, 1)" for "--ease-out". */
export function motionValue(token: ValueToken | DurationToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

/** A duration from motion.css in milliseconds. */
export function motionMs(token: DurationToken): number {
  const v = motionValue(token);
  return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
}

/** Whether the phone or computer is set to reduce motion. */
export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Whether anything has changed since the page loaded: a filter, a link, the back button.
// Until then nothing plays an entrance, so what the server sent is never hidden.
let changedSinceLoad = false;

/** Call when someone changes what's shown (a filter), before the change renders. */
export function markClientChange(): void {
  changedSinceLoad = true;
}

/** Whether someone has changed what's shown since the page loaded. */
export function clientChanged(): boolean {
  return changedSinceLoad;
}

const ROWS_STAGGERED = 10; // a 50-event list never takes longer than the first 10 rows

/**
 * New rows rise into place one after another, 30ms apart, first 10 only. Rows already there
 * (in `seen`) stay still; every row found is added to it.
 */
export function riseNewRows(rows: Iterable<HTMLElement>, seen: WeakSet<Element>): void {
  const fresh = [...rows].filter((el) => !seen.has(el));
  fresh.forEach((el) => seen.add(el));
  if (!changedSinceLoad || reducedMotion()) return;
  const duration = motionMs("--motion-base");
  const stagger = motionMs("--motion-stagger");
  const easing = motionValue("--ease-out");
  const rise = motionValue("--motion-rise");
  // Only rows that are showing count (not ones in a closed "more" box).
  fresh.filter((el) => el.getClientRects().length > 0).slice(0, ROWS_STAGGERED).forEach((el, i) => {
    el.animate([{ opacity: 0, translate: `0 ${rise}` }, { opacity: 1, translate: "0 0" }], { duration, delay: i * stagger, easing, fill: "backwards" });
  });
}

/**
 * A crossfade for a list about to change: a copy of how it looks now, laid over it and faded
 * out once the new list is in (call the returned function then). The copy can't be tapped or
 * read out, so the new list underneath works straight away.
 */
export function captureForCrossfade(list: HTMLElement | null): (() => void) | null {
  if (!list) return null;
  const ghost = list.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  // Where the list is now, in the box it's positioned in (its offsetParent), which the copy shares.
  Object.assign(ghost.style, {
    position: "absolute",
    top: `${list.offsetTop}px`,
    left: `${list.offsetLeft}px`,
    width: `${list.offsetWidth}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "1",
  });
  return () => {
    list.after(ghost);
    const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: motionMs("--motion-base") * 0.8,
      easing: motionValue("--ease-in"),
      fill: "forwards",
    });
    const remove = () => ghost.remove();
    fade.finished.then(remove, remove);
  };
}
