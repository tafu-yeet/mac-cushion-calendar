"""Decides what happens to each extracted event without waiting for a person.

An event publishes itself only when all of these hold; otherwise it waits in
the review queue:
- its confidence is at least AUTO_APPROVE_MIN_CONFIDENCE with free food, or
  AUTO_APPROVE_OTHER_MIN_CONFIDENCE without;
- the second model rechecked the post and agreed: the event is its reading and
  has no review notes (a tie-breaker reading settles disagreements, see
  extractors/two_stage.py);
- it has a date and start time, today or later (time-TBD posts are often
  teasers that a fuller post follows);
- it's run by the posting club, or co-run with a club on our list, or held on
  campus or online (an off-campus collab can be another school's event);
- no other club's event looks like the same one: a similar name on the same
  day, the same start time and room, or a repost naming this club as host.

Copies sort themselves out instead of waiting for a person. Within one club
(never between two events from the same post, which the model split on
purpose):
- a copy of an event already published is rejected;
- of several pending copies on the same day, the most complete one stays and
  the rest are rejected;
- an undated teaser is rejected once a dated event with its name arrives;
- when a newer post gives a near-identical event another date that isn't a
  whole number of weeks away (a moved date, not a weekly series), the older
  date is rejected.

Pending events also expire: once their date has passed, or when no date was
announced within UNDATED_EXPIRE_DAYS of the post. Events limited to a group
can publish: the site hides them unless asked. Rejections here are notes on
the event, so a person can move any of them back to the queue.

Run directly to apply all of this to events already waiting:
    python auto_approve.py                    list what would change
    python auto_approve.py --apply            make the changes
    python auto_approve.py --settle --apply   first let the tie-breaker read disputed posts
"""

from __future__ import annotations

import argparse
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

from supabase import Client

from extractors.two_stage import room_key, settle, settleable
from settings import AUTO_APPROVE_MIN_CONFIDENCE, AUTO_APPROVE_OTHER_MIN_CONFIDENCE, CAMPUS, LOCAL_TZ

# Same threshold and filler words as the review queue's grouping (src/lib/duplicates.ts).
SIMILAR_NAMES = 0.6
NEAR_IDENTICAL_NAMES = 0.8
MOVED_WITHIN_DAYS = 14
UNDATED_EXPIRE_DAYS = 14
FILLER = {"mcmaster", "mac", "the", "a", "an", "of", "at", "and", "x", "with", "club", "society", "association"}
# Names that number their own dates ("Day 2", "(Friday)", "Oct 24") are a series, never a moved date.
SERIES_NAME = re.compile(r"\b(day|part|week|session)\s*\d|\(\w+\)|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w* \d", re.I)
CAMPUS_PLACE = re.compile(
    r"\b(" + "|".join(re.escape(k) for k in CAMPUS["campusLocations"]) + r"|mcmaster|zoom|online|teams|virtual)\b", re.I
)
FIELDS = "id, name, status, reviewed_by, club_id, post_id, starts_at, start_time_known, ends_at, location, price, confidence, hosted_by, posts(posted_at)"


@dataclass
class Decision:
    action: str  # "approve", "reject", or "hold"
    reason: str
    note: str | None = None  # added to the event's review notes
    reject_others: list[tuple[int, str]] = field(default_factory=list)  # (id, note): pending copies this one replaces


# Decisions -----------------------------------------------------------------

def review(sb: Client, row: dict, verified_by: str | None, club_name: str, posted_at: str, exclude_id: int | None = None) -> Decision:
    """Decides `row` and applies the decision to it in place (status and notes).

    The caller saves `row` and rejects `decision.reject_others`.
    """
    decision = decide(sb, row, verified_by, club_name, posted_at, exclude_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    if decision.action == "approve":
        row.update(status="approved", auto_approved=True, reviewed_at=now_iso)
    elif decision.action == "reject":
        row.update(status="rejected", reviewed_at=now_iso)
    if decision.note:
        row["review_notes"] = [*row["review_notes"], decision.note]
    return decision


def decide(sb: Client, row: dict, verified_by: str | None, club_name: str, posted_at: str, exclude_id: int | None = None) -> Decision:
    today = datetime.now(LOCAL_TZ).date()
    others: list[tuple[int, str]] = []
    if row["starts_at"]:
        start = _local(row["starts_at"])
        for o in _club_events(sb, row, exclude_id):
            if o["post_id"] == row["post_id"]:
                continue
            if not o["starts_at"]:
                if o["status"] == "pending" and similar_names(row["name"], o["name"]):
                    others.append((o["id"], f"Rejected automatically: “{row['name']}” announced a date for this teaser."))
                continue
            o_start = _local(o["starts_at"])
            same_day = o_start.date() == start.date()
            same_start = o["start_time_known"] and row["start_time_known"] and o_start == start
            if same_day and (same_start or similar_names(row["name"], o["name"])):
                if o["status"] == "approved":
                    return Decision("reject", "copy of a published event", f"Rejected automatically: a copy of “{o['name']}” (#{o['id']}), already published.")
                if o["status"] == "rejected":
                    if o["reviewed_by"]:  # a person rejected it, so don't publish its twin
                        return Decision("hold", "looks like a rejected event", f"Not published automatically: it looks like “{o['name']}” (#{o['id']}), which was rejected. Reject this one if it's the same event.")
                    continue
                if (_detail(o), -o["id"]) > (_detail(row), -(row.get("id") or 1 << 62)):
                    return Decision("reject", "less complete copy", f"Rejected automatically: a less complete copy of “{o['name']}” (#{o['id']}).")
                others.append((o["id"], f"Rejected automatically: a less complete copy of “{row['name']}”."))
            elif not same_day and o["status"] != "rejected" and _moved(row, o):
                o_posted = (o.get("posts") or {}).get("posted_at") or ""
                if o_posted > posted_at:
                    return Decision("reject", "date moved", f"Rejected automatically: a newer post (#{o['id']}) gives it another date.")
                if o["status"] == "pending":
                    others.append((o["id"], f"Rejected automatically: a newer post (“{row['name']}”) gives it another date."))

    reason = blocker(sb, row, verified_by, today)
    if reason:
        return Decision("hold", reason, reject_others=others)
    other = _other_club_lookalike(sb, row, club_name, exclude_id)
    if other is not None:
        note = None
        if other["status"] != "pending":
            note = (f"Not published automatically: it looks like “{other['name']}” (#{other['id']}, {other['status']}). "
                    "Reject this one if it's the same event.")
        return Decision("hold", "looks like another club's event", note, others)
    return Decision("approve", "", None, others)


def blocker(sb: Client, row: dict, verified_by: str | None, today: date) -> str | None:
    """Why this event can't publish itself (before looking at other events), or None."""
    if AUTO_APPROVE_MIN_CONFIDENCE is None:
        return "auto-approval is off"
    if not row["starts_at"] or not row["start_time_known"]:
        return "no start time"
    if _local(row["starts_at"]).date() < today:
        return "already happened"
    bar = AUTO_APPROVE_MIN_CONFIDENCE if row["has_free_food"] else AUTO_APPROVE_OTHER_MIN_CONFIDENCE
    if (row["confidence"] or 0) < bar:
        return "confidence below the bar"
    if not verified_by or row["model"] != verified_by:
        return "not rechecked"
    if row["review_notes"]:
        return "has review notes"
    if row.get("schedule_status", "scheduled") != "scheduled":
        return f"the post says it's {row['schedule_status']}"
    if row["hosted_by"] and not _known_host(sb, row["hosted_by"]) and not CAMPUS_PLACE.search(row["location"] or ""):
        return "collab off campus"
    return None


def reject(sb: Client, event_id: int, note: str) -> None:
    """Rejects a pending event, adding `note` to its review notes."""
    current = sb.table("events").select("status, review_notes").eq("id", event_id).single().execute().data
    if current["status"] != "pending":
        return
    sb.table("events").update({
        "status": "rejected",
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "review_notes": [*current["review_notes"], note],
    }).eq("id", event_id).execute()


def expire_stale(sb: Client) -> int:
    """Rejects pending events whose date has passed, or that never got a date. Returns how many."""
    today_start = datetime.combine(datetime.now(LOCAL_TZ).date(), time(), LOCAL_TZ)
    past = sb.table("events").select("id").eq("status", "pending").lt("starts_at", _utc(today_start)).execute().data
    cutoff = _utc(datetime.now(timezone.utc) - timedelta(days=UNDATED_EXPIRE_DAYS))
    undated = (
        sb.table("events").select("id, posts!inner(posted_at)").eq("status", "pending").is_("starts_at", "null")
        .lt("posts.posted_at", cutoff).execute().data
    )
    for e in past:
        reject(sb, e["id"], "Expired: the date passed before it was reviewed.")
    for e in undated:
        reject(sb, e["id"], f"Expired: no date announced within {UNDATED_EXPIRE_DAYS} days of the post.")
    return len(past) + len(undated)


# Comparing events ----------------------------------------------------------

def _club_events(sb: Client, row: dict, exclude_id: int | None) -> list[dict]:
    """The same club's events near this one's date, plus its undated ones."""
    day = _local(row["starts_at"]).date()
    lo = datetime.combine(day - timedelta(days=MOVED_WITHIN_DAYS), time(), LOCAL_TZ)
    hi = datetime.combine(day + timedelta(days=MOVED_WITHIN_DAYS + 1), time(), LOCAL_TZ)
    near = (
        sb.table("events").select(FIELDS).eq("club_id", row["club_id"])
        .gte("starts_at", _utc(lo)).lt("starts_at", _utc(hi)).execute().data
    )
    undated = sb.table("events").select(FIELDS).eq("club_id", row["club_id"]).is_("starts_at", "null").execute().data
    return [o for o in near + undated if o["id"] != exclude_id]


def _other_club_lookalike(sb: Client, row: dict, club_name: str, exclude_id: int | None) -> dict | None:
    """Another club's event (any status) on the same day that may be this one."""
    start = _local(row["starts_at"])
    day_start = datetime.combine(start.date(), time(), LOCAL_TZ)
    same_day = (
        sb.table("events").select(FIELDS).neq("club_id", row["club_id"])
        .gte("starts_at", _utc(day_start)).lt("starts_at", _utc(day_start + timedelta(days=1)))
        .execute().data
    )
    for other in same_day:
        if other["id"] == exclude_id or other["status"] == "rejected":
            continue
        reposted = bool(club_name and other["hosted_by"]) and club_name.lower() in other["hosted_by"].lower()
        same_slot = (
            other["start_time_known"]
            and _local(other["starts_at"]) == start
            and room_key(row["location"]) != ""
            and room_key(row["location"]) == room_key(other["location"])
        )
        if reposted or same_slot or similar_names(row["name"], other["name"]):
            return other
    return None


def _moved(row: dict, other: dict) -> bool:
    """Whether `other` looks like this event at another date, rather than another session of it."""
    gap = abs((_local(other["starts_at"]).date() - _local(row["starts_at"]).date()).days)
    return (
        0 < gap <= MOVED_WITHIN_DAYS
        and gap % 7 != 0  # whole weeks apart: a weekly series
        and name_similarity(row["name"], other["name"]) >= NEAR_IDENTICAL_NAMES
        and not SERIES_NAME.search(row["name"])
        and not SERIES_NAME.search(other["name"])
    )


def _detail(e: dict) -> float:
    """How complete a listing is, to pick which copy to keep."""
    return 2 * bool(e["start_time_known"]) + bool(e["ends_at"]) + bool(e["location"]) + bool(e["price"]) + (e["confidence"] or 0)


_known_hosts: list[str] | None = None


def _known_host(sb: Client, hosted_by: str) -> bool:
    """Whether a co-host is a club we follow, by name or @handle."""
    global _known_hosts
    if _known_hosts is None:
        clubs = sb.table("clubs").select("name, instagram_username").execute().data
        _known_hosts = [c["name"].lower() for c in clubs] + ["@" + c["instagram_username"].lower() for c in clubs]
    host = hosted_by.lower()
    return any(k in host for k in _known_hosts)


def similar_names(a: str, b: str) -> bool:
    return word_overlap(a, b) >= SIMILAR_NAMES or name_similarity(a, b) >= SIMILAR_NAMES


def name_similarity(a: str, b: str) -> float:
    """Dice coefficient over character pairs: 1 for identical names, 0 for nothing in common."""
    x, y = _normalize(a), _normalize(b)
    if not x or not y:
        return 0.0
    if x == y:
        return 1.0

    def pairs(s: str) -> Counter[str]:
        return Counter(s[i : i + 2] for i in range(len(s) - 1))

    shared = sum((pairs(x) & pairs(y)).values())
    total = (len(x) - 1) + (len(y) - 1)
    return 2 * shared / total if total else 0.0


def word_overlap(a: str, b: str) -> float:
    """Share of the shorter name's words found in the longer one; needs two words to go on."""
    def words(s: str) -> set[str]:
        return {w for w in _normalize(s).split() if len(w) > 1 or w.isdigit()}

    x, y = words(a), words(b)
    if min(len(x), len(y)) < 2:
        return 0.0
    return len(x & y) / min(len(x), len(y))


def _normalize(name: str) -> str:
    text = re.sub(r"[^a-z0-9\s]", " ", unicodedata.normalize("NFKD", name.lower()))
    return " ".join(w for w in text.split() if w not in FILLER)


def _local(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso)
    return (dt if dt.tzinfo else dt.replace(tzinfo=LOCAL_TZ)).astimezone(LOCAL_TZ)


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# Settling saved disagreements ------------------------------------------------

def settle_saved(sb: Client, events: list[dict], apply: bool) -> int:
    """Lets the tie-breaker read the posts behind saved events with disagreement notes.

    Returns how many events it settled. Only today-onward events are worth the read.
    """
    from datetime import datetime as dt

    from extractors import new_extractor
    from settings import TIEBREAK_MODEL
    from store import load_image, log_usage

    if TIEBREAK_MODEL.lower() == "none":
        return 0
    tiebreak = new_extractor("claude", TIEBREAK_MODEL)
    today = datetime.now(LOCAL_TZ).date()
    by_post: dict[str, list[dict]] = {}
    for e in events:
        wrapped = SimpleNamespace(notes=list(e["review_notes"]))
        if e["starts_at"] and _local(e["starts_at"]).date() >= today and settleable(wrapped):
            by_post.setdefault(e["post_id"], []).append(e)

    settled = 0
    for post_id, rows in by_post.items():
        post = sb.table("posts").select("*, clubs(name)").eq("id", post_id).single().execute().data
        image = load_image(sb, post["image_path"]) if post["image_path"] else None
        third, usage = tiebreak.extract(
            club_name=post["clubs"]["name"], username=post["username"],
            posted_at=dt.fromisoformat(post["posted_at"]), caption=post["caption"], image=image,
        )
        if apply:
            log_usage(sb, post_id, usage, "tiebreak")
        wrapped = [
            SimpleNamespace(
                row=r, notes=list(r["review_notes"]),
                event=SimpleNamespace(event_name=r["name"], start=_local(r["starts_at"]), start_time_known=r["start_time_known"], location=r["location"]),
            )
            for r in rows
        ]
        settled += settle(wrapped, third.events)
        for w in wrapped:
            if w.notes != w.row["review_notes"]:
                print(f"  settled #{w.row['id']} {w.row['name']}")
                w.row["review_notes"] = w.notes
                if apply:
                    sb.table("events").update({"review_notes": w.notes}).eq("id", w.row["id"]).execute()
    return settled


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply the auto-approval rules to pending events.")
    parser.add_argument("--apply", action="store_true", help="make the changes (otherwise just list them)")
    parser.add_argument("--settle", action="store_true", help="let the tie-breaker read disputed posts first (costs API calls)")
    args = parser.parse_args()

    from store import connect  # store imports this module

    sb = connect()
    if args.apply:
        print(f"{expire_stale(sb)} stale event(s) expired")
    pending = sb.table("events").select("*, clubs(name), posts(extraction, posted_at)").eq("status", "pending").execute().data
    if args.settle:
        print(f"{settle_saved(sb, pending, args.apply)} event(s) settled by the tie-breaker")

    # The most complete copies go first, so they're the ones that stay.
    pending.sort(key=lambda e: _detail(e) if e["starts_at"] else -1, reverse=True)
    handled: set[int] = set()
    counts: Counter[str] = Counter()
    for event in pending:
        if event["id"] in handled:
            continue
        verified_by = ((event.get("posts") or {}).get("extraction") or {}).get("verified_by")
        posted_at = (event.get("posts") or {}).get("posted_at") or ""
        before = list(event["review_notes"])
        decision = review(sb, event, verified_by, (event.get("clubs") or {}).get("name", ""), posted_at, exclude_id=event["id"])
        counts[decision.action if decision.action != "hold" else f"held: {decision.reason}"] += 1
        if decision.action != "hold":
            when = _local(event["starts_at"]).strftime("%a %b %d %I:%M %p") if event["starts_at"] else "no date"
            print(f"  {decision.action:7} #{event['id']} {event['name']} | {when}" + (f" | {decision.reason}" if decision.reason else ""))
        if args.apply and (decision.action != "hold" or event["review_notes"] != before):
            sb.table("events").update(
                {k: event[k] for k in ("status", "auto_approved", "reviewed_at", "review_notes") if k in event}
            ).eq("id", event["id"]).execute()
        for other_id, note in decision.reject_others:
            if other_id in handled:
                continue
            handled.add(other_id)
            counts["reject (copy)"] += 1
            print(f"  reject  #{other_id} | {note}")
            if args.apply:
                reject(sb, other_id, note)
        handled.add(event["id"])

    print("\nSummary" + ("" if args.apply else " (nothing changed; add --apply)") + ":")
    for what, n in counts.most_common():
        print(f"  {n:4d}  {what}")


if __name__ == "__main__":
    main()
