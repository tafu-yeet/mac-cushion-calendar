"""A launch-readiness report: upcoming events flagged as possibly off (marking the
ones a run just flagged), and every upcoming event's registration. Written to
worker/out/ as Markdown.

Usage (from worker/):
    python launch_report.py --new 812,816     the ids recheck.py printed as flagged
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

from rubric import fetch_all
from settings import LOCAL_TZ, WORKER_DIR
from store import connect

OFF_FLAGS = {"instagram_post_deleted", "possibly_cancelled", "caption_changed", "rubric_cancelled", "rubric_missing", "reported_cancelled"}
WHERE = {"rubric": "Rubric", "link_in_bio": "link in bio", "form": "form", "qr_code": "QR code on the poster",
         "at_the_door": "at the door", "other": "other (see post)", None: "not said"}


def when(iso: str) -> str:
    d = datetime.fromisoformat(iso).astimezone(LOCAL_TZ)
    return f"{d:%a %b} {d.day}, {d:%I:%M %p}".replace(" 0", " ")


def cell(text: str | None) -> str:
    return (text or "").replace("|", "/").replace("\n", " ").strip()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Write the launch-readiness report.")
    parser.add_argument("--new", type=lambda s: {int(x) for x in s.split(",") if x}, default=set(),
                        help="event ids flagged by this run (recheck.py prints them)")
    args = parser.parse_args()
    sb = connect()
    now = datetime.now(timezone.utc).isoformat()
    events = fetch_all(lambda a, b: sb.table("events").select(
        "id, name, status, starts_at, flags, review_notes, updated_at, schedule_status, registration, registration_where, "
        "registration_url, registration_note, clubs(instagram_username)")
        .in_("status", ["approved", "pending"]).gte("starts_at", now).order("starts_at").range(a, b))

    flagged = [e for e in events if OFF_FLAGS & set(e["flags"] or [])]
    new = [e for e in flagged if e["id"] in args.new]
    lines = [f"# Launch check, {datetime.now(LOCAL_TZ):%A %B %d, %Y %I:%M %p}", "",
             f"## Upcoming events flagged as possibly cancelled ({len(flagged)}; {len(new)} new this run, marked ★)", "",
             "Nothing was cancelled automatically: these wait in the admin's \"Needs a look\".", ""]
    if flagged:
        lines += ["| # | Event | Club | When | Status | Why |", "|---|---|---|---|---|---|"]
        for e in sorted(flagged, key=lambda e: (e["id"] not in args.new, e["starts_at"])):
            why = "; ".join(n for n in e["review_notes"] or [] if any(w in n for w in ("deleted", "edited", "posted", "reported", "Rubric")))
            lines.append(f"| {'★ ' if e['id'] in args.new else ''}{e['id']} | {cell(e['name'])} | @{(e['clubs'] or {}).get('instagram_username', '')} | "
                         f"{when(e['starts_at'])} | {e['status']} | {cell(', '.join(sorted(OFF_FLAGS & set(e['flags']))))}: {cell(why)[:300]} |")
    else:
        lines.append("None.")

    with_info = [e for e in events if e["registration"] != "unknown"]
    counts = {s: sum(1 for e in with_info if e["registration"] == s) for s in ("required", "recommended", "drop_in")}
    lines += ["", f"## Upcoming events with registration info ({len(with_info)} of {len(events)})", "",
              f"{counts['required']} required, {counts['recommended']} RSVP appreciated, {counts['drop_in']} drop in; "
              f"the other {len(events) - len(with_info)} don't say.", "",
              "| # | Event | Club | When | Registration | Where | From |", "|---|---|---|---|---|---|---|"]
    for e in with_info:
        lines.append(f"| {e['id']} | {cell(e['name'])} | @{(e['clubs'] or {}).get('instagram_username', '')} | {when(e['starts_at'])} | "
                     f"{e['registration'].replace('_', ' ')} | {WHERE.get(e['registration_where'], e['registration_where']) if e['registration'] != 'drop_in' else ''} | "
                     f"{cell(e['registration_note'])} |")

    out = WORKER_DIR / "out" / f"launch_check_{datetime.now(LOCAL_TZ):%Y-%m-%d}.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(flagged)} flagged, {len(with_info)} with registration info -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
