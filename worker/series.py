"""Weekly programs (event_series) as events, one per day, for the site's next six weeks.

A person enters a program once on the admin's Weekly page: the days, time, place
and food, and the dates it runs (minus reading week and the like). Each cycle
this lists every day of it as an approved event, so it shows on the home page,
the calendar and Communities like any other, and keeps those days in step when
the program is edited, ended or stopped.

A club's own post about one of those days (the week's menu, a room change) is
the better listing: when the same club has a published event that day that's
the same one (auto_approve.same_event), that day's entry steps aside, and comes
back if the post's event goes. A day a person edited (a field in reviewed_fields,
or marked cancelled) is theirs: only its date can remove it.

Usage (from worker/):
    python series.py        bring every program's days in line, listing what changed
"""

from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta, timezone

from supabase import Client

from auto_approve import same_event
from rubric import fetch_all
from settings import LOCAL_TZ

AHEAD_WEEKS = 6  # as far ahead as the site lists events
STEPPED_ASIDE = "The club's own post for this day is listed instead."
SERIES_FIELDS = (
    "id, club_id, name, category, days, start_time, end_time, location, has_free_food, food_description, cost, "
    "open_to_all, description, starts_on, ends_on, skip_dates, active"
)


def _clock(value: str) -> time:
    return time.fromisoformat(value)


def _at(day: date, clock: time) -> str:
    return datetime.combine(day, clock, LOCAL_TZ).astimezone(timezone.utc).isoformat()


def days_of(s: dict, start: date, end: date) -> list[date]:
    """The program's days between start and end, inclusive."""
    skip = {date.fromisoformat(d) for d in s["skip_dates"] or []}
    first, last = max(start, date.fromisoformat(s["starts_on"])), min(end, date.fromisoformat(s["ends_on"]))
    out, day = [], first
    while day <= last:
        if day.isoweekday() in s["days"] and day not in skip:
            out.append(day)
        day += timedelta(days=1)
    return out


def event_row(s: dict, day: date) -> dict:
    """The fields of one day's event, as the program says them."""
    start = _clock(s["start_time"])
    end = _clock(s["end_time"]) if s["end_time"] else None
    return {
        "club_id": s["club_id"], "series_id": s["id"], "post_id": None, "source": "series",
        "name": s["name"], "category": s["category"], "event_type": s["category"],
        "starts_at": _at(day, start), "ends_at": _at(day, end) if end else None, "start_time_known": True,
        "location": s["location"], "off_campus": False,
        "has_free_food": s["has_free_food"], "food_description": s["food_description"] if s["has_free_food"] else None,
        "cost": s["cost"], "open_to_all": s["open_to_all"], "description": s["description"],
        "confidence": 1.0, "reason": "A weekly program.", "model": "series",
        "extracted": {"source": "series", "series_id": s["id"]},
    }


def run(sb: Client, apply: bool = True, verbose: bool = False) -> dict[str, int]:
    """Brings every program's days in the next AHEAD_WEEKS in line. Returns counts of what changed."""
    today = datetime.now(LOCAL_TZ).date()
    end = today + timedelta(weeks=AHEAD_WEEKS)
    lo, hi = _at(today, time()), _at(end + timedelta(days=1), time())
    done = {"added": 0, "updated": 0, "stepped_aside": 0, "back": 0, "removed": 0}
    programs = fetch_all(lambda a, b: sb.table("event_series").select(SERIES_FIELDS).range(a, b))
    if not programs:
        return done
    listed = fetch_all(lambda a, b: sb.table("events").select("*").not_.is_("series_id", "null")
                       .gte("starts_at", lo).lt("starts_at", hi).range(a, b))
    # The clubs' own events in the window, to see whether one already lists a day.
    club_ids = sorted({s["club_id"] for s in programs})
    own = fetch_all(lambda a, b: sb.table("events").select("id, club_id, name, location, starts_at, start_time_known, status")
                    .in_("club_id", club_ids).eq("status", "approved").is_("series_id", "null")
                    .gte("starts_at", lo).lt("starts_at", hi).range(a, b))

    def write(action: str, query) -> None:
        done[action] += 1
        if apply:
            query.execute()

    for s in programs:
        wanted = {d: event_row(s, d) for d in (days_of(s, today, end) if s["active"] else [])}
        mine = {datetime.fromisoformat(e["starts_at"]).astimezone(LOCAL_TZ).date(): e for e in listed if e["series_id"] == s["id"]}

        # Days it no longer runs: the program stopped, ended sooner, skips or drops that day.
        for day, e in mine.items():
            if day not in wanted:
                if verbose:
                    print(f"  remove   {s['name']} {day}")
                write("removed", sb.table("events").delete().eq("id", e["id"]))

        for day, row in wanted.items():
            e = mine.get(day)
            covered = next((o for o in own if o["club_id"] == s["club_id"]
                            and datetime.fromisoformat(o["starts_at"]).astimezone(LOCAL_TZ).date() == day
                            and same_event(row, o, same_club=True)), None)
            if e is None:
                if covered:
                    continue
                if verbose:
                    print(f"  add      {s['name']} {day}")
                status = {"status": "approved", "auto_approved": True, "reviewed_at": datetime.now(timezone.utc).isoformat()}
                write("added", sb.table("events").insert(row | status))
                continue
            if e["reviewed_by"] and e["status"] != "approved":
                continue  # a person took this day off the site
            if covered and e["status"] == "approved":
                if verbose:
                    print(f"  aside    {s['name']} {day} (#{covered['id']} “{covered['name']}”)")
                write("stepped_aside", sb.table("events").update({
                    "status": "rejected", "review_notes": [*(e["review_notes"] or []), STEPPED_ASIDE]}).eq("id", e["id"]))
                if e["highlighted"] and apply:  # the highlight moves to the post listed instead
                    sb.table("events").update({"highlighted": True, "highlighted_at": e["highlighted_at"]}).eq("id", covered["id"]).execute()
                continue
            if not covered and e["status"] == "rejected" and STEPPED_ASIDE in (e["review_notes"] or []):
                if verbose:
                    print(f"  back     {s['name']} {day}")
                write("back", sb.table("events").update({
                    "status": "approved", "review_notes": [n for n in e["review_notes"] if n != STEPPED_ASIDE]}).eq("id", e["id"]))
            # Edits to the program reach its days, except what a person changed on one.
            reviewed = set(e["reviewed_fields"] or [])
            changes = {k: v for k, v in row.items() if k not in reviewed and not _same(e.get(k), v)}
            if changes:
                if verbose:
                    print(f"  update   {s['name']} {day}: {', '.join(changes)}")
                write("updated", sb.table("events").update(changes).eq("id", e["id"]))
    return done


def _same(a, b) -> bool:
    """Equal, reading timestamps as instants ("...+00:00" and "...Z" are one time)."""
    if isinstance(a, str) and isinstance(b, str) and "T" in a and "T" in b:
        try:
            return datetime.fromisoformat(a.replace("Z", "+00:00")) == datetime.fromisoformat(b.replace("Z", "+00:00"))
        except ValueError:
            pass
    return a == b


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    from store import connect

    print("saved:", run(connect(), apply=True, verbose=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
