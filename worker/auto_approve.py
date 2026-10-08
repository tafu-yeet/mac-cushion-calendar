"""Publishes confident free-food events without waiting for review.

An event is approved on its own only when all of these hold; anything else
waits in the review queue as before:
- it has free food, at a confidence of at least AUTO_APPROVE_MIN_CONFIDENCE;
- the second model rechecked the post and agreed: the event is its reading and
  has no review notes;
- it has a date and start time, today or later (time-TBD posts are often
  teasers that a fuller post follows);
- it's open to all and run by the posting club (collabs and reposts can be
  another school's event, or a copy of one already listed);
- no other event, whatever its status, looks like the same one: the same club
  on the same day, a similar name on the same day or undated from the same
  club, the same start time and room, or a repost naming this club as host.

Run directly to apply the rule to free-food events already waiting:
    python auto_approve.py           list what would be approved
    python auto_approve.py --apply   approve them
"""

from __future__ import annotations

import argparse
import re
import unicodedata
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone

from supabase import Client

from settings import AUTO_APPROVE_MIN_CONFIDENCE, LOCAL_TZ

# Same threshold and filler words as the review queue's grouping (src/lib/duplicates.ts).
SIMILAR_NAMES = 0.6
FILLER = {"mcmaster", "mac", "the", "a", "an", "of", "at", "and", "x", "with", "club", "society", "association"}

LOOKALIKE_FIELDS = "id, name, status, club_id, starts_at, start_time_known, location, hosted_by"


def blocker(row: dict, verified_by: str | None, today: date) -> str | None:
    """Why this event can't be approved on its own, or None if it passes (before the lookalike check)."""
    if AUTO_APPROVE_MIN_CONFIDENCE is None:
        return "auto-approval is off"
    if not row["has_free_food"]:
        return "no free food"
    if (row["confidence"] or 0) < AUTO_APPROVE_MIN_CONFIDENCE:
        return "confidence below the bar"
    if not verified_by or row["model"] != verified_by:
        return "not rechecked"
    if row["review_notes"]:
        return "has review notes"
    if not row["starts_at"] or not row["start_time_known"]:
        return "no start time"
    if _local(row["starts_at"]).date() < today:
        return "already happened"
    if not row["open_to_all"]:
        return "not open to all"
    if row["hosted_by"]:
        return "hosted by another group"
    return None


def find_lookalike(sb: Client, row: dict, club_name: str, exclude_id: int | None = None) -> dict | None:
    """Another event (any status) that may be this one. `row` must have a start date."""
    start = _local(row["starts_at"])
    day_start = datetime.combine(start.date(), time(), LOCAL_TZ)
    same_day = (
        sb.table("events").select(LOOKALIKE_FIELDS)
        .gte("starts_at", _utc(day_start)).lt("starts_at", _utc(day_start + timedelta(days=1)))
        .execute().data
    )
    undated = (
        sb.table("events").select(LOOKALIKE_FIELDS)
        .is_("starts_at", "null").eq("club_id", row["club_id"]).execute().data
    )
    for other in undated:
        if other["id"] != exclude_id and similar_names(row["name"], other["name"]):
            return other
    for other in same_day:
        if other["id"] == exclude_id:
            continue
        same_club = other["club_id"] == row["club_id"]
        reposted = bool(club_name and other["hosted_by"]) and club_name.lower() in other["hosted_by"].lower()
        same_slot = (
            other["start_time_known"]
            and _local(other["starts_at"]) == start
            and _room(row["location"]) != ""
            and _room(row["location"]) == _room(other["location"])
        )
        if same_club or reposted or same_slot or similar_names(row["name"], other["name"]):
            return other
    return None


def review(sb: Client, row: dict, verified_by: str | None, club_name: str, exclude_id: int | None = None) -> bool:
    """Approves `row` in place if it passes; returns whether it did.

    When the only thing stopping it is a lookalike that's already been reviewed,
    a note says so: the queue groups pending lookalikes, but not reviewed ones.
    """
    if blocker(row, verified_by, datetime.now(LOCAL_TZ).date()):
        return False
    other = find_lookalike(sb, row, club_name, exclude_id)
    if other is None:
        row.update(status="approved", auto_approved=True, reviewed_at=datetime.now(timezone.utc).isoformat())
        return True
    if other["status"] != "pending":
        row["review_notes"] = [*row["review_notes"], (
            f"Not published automatically: it looks like “{other['name']}” (#{other['id']}, {other['status']}). "
            "Reject this one if it's the same event."
        )]
    return False


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


def _room(location: str | None) -> str:
    """The place as written, minus the model's expansion: "ETB 124 (Engineering Technology Building)" -> "etb124".

    Comparing whole locations would match any two rooms whose expansions share "Engineering Building".
    """
    return re.sub(r"[^a-z0-9]", "", re.split(r"[(,]", (location or "").lower())[0])


def _local(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso)
    return (dt if dt.tzinfo else dt.replace(tzinfo=LOCAL_TZ)).astimezone(LOCAL_TZ)


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply the auto-approval rule to pending free-food events.")
    parser.add_argument("--apply", action="store_true", help="approve them (otherwise just list them)")
    args = parser.parse_args()

    from store import connect  # store imports this module

    sb = connect()
    pending = (
        sb.table("events").select("*, clubs(name), posts(extraction)")
        .eq("status", "pending").eq("has_free_food", True)
        .order("confidence", desc=True).execute().data
    )
    today = datetime.now(LOCAL_TZ).date()
    held: Counter[str] = Counter()
    approved = 0
    for event in pending:
        verified_by = ((event.get("posts") or {}).get("extraction") or {}).get("verified_by")
        reason = blocker(event, verified_by, today)
        if reason:
            held[reason] += 1
            continue
        notes = list(event["review_notes"])
        if review(sb, event, verified_by, (event.get("clubs") or {}).get("name", ""), exclude_id=event["id"]):
            approved += 1
            when = _local(event["starts_at"]).strftime("%a %b %d %I:%M %p")
            print(f"  #{event['id']} {event['name']} | {when} | {event['food_description']}")
            if args.apply:
                sb.table("events").update(
                    {k: event[k] for k in ("status", "auto_approved", "reviewed_at")}
                ).eq("id", event["id"]).execute()
        else:
            held["looks like another event"] += 1
            if args.apply and event["review_notes"] != notes:
                sb.table("events").update({"review_notes": event["review_notes"]}).eq("id", event["id"]).execute()

    print(f"{approved} event(s) {'approved' if args.apply else 'would be approved'}; left for review:")
    for reason, n in held.most_common():
        print(f"  {n:4d}  {reason}")


if __name__ == "__main__":
    main()
