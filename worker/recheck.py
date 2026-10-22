"""Keeps upcoming events honest about whether they're still on. Nothing here
cancels an event: it flags events for a person (admin "Needs a look"), who sets
Cancelled or Postponed on the event.

- Every profile fetch (run.fetch_club) saves captions a club edited and passes
  new and edited posts to scan(): one that says an event is off ("cancelled",
  "canceled", "postponed", "rescheduled", "no longer happening") flags that
  club's upcoming events (possibly_cancelled).
- Once a day, daily() checks the source post of every event in the next
  DAYS_AHEAD days. The club's profile is fetched if it wasn't today (that also
  notices deleted posts and edited captions); a post too old to show on the
  profile is opened on its own page. A deleted or unavailable post flags its
  events (instagram_post_deleted). An edited caption is read again, and its
  events are flagged (caption_changed) when the date, time, place or status
  moved, or the event is no longer in the post at all.
- Rubric events that leave Rubric or are titled cancelled are flagged by merge.py.

Usage (from worker/):
    python recheck.py                run the daily check now and list what it flagged
    python recheck.py --every-club   first run: fetch every club with an upcoming event, and
                                     scan the last 3 days' posts for cancellations too
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Callable

from supabase import Client

import store
from auto_approve import name_similarity, word_overlap
from extractors import ExtractionError, ExtractorUnavailable, new_pipeline
from extractors.two_stage import same_place
from fetchers import BlockedError, print_attempt
from fetchers.profile_page import fetch_post_page
from rubric import fetch_all
from settings import LOCAL_TZ, WORKER_DIR

DAYS_AHEAD = 14
STATE_FILE = WORKER_DIR / "cache" / "recheck.json"
DAILY_AFTER_HOUR = 6   # local time; the first cycle after this runs the day's check
REFRESH_HOURS = 20     # a club fetched more recently than this counts as checked today
FETCH_DELAY_S = (2.0, 5.0)
CANCEL_WORDS = re.compile(r"\b(cancell?ed|postponed|rescheduled|no longer happening|not happening anymore)\b", re.I)


def _local(iso: str) -> datetime:
    return datetime.fromisoformat(iso).astimezone(LOCAL_TZ)


def _when(iso: str | None, known: bool = True) -> str:
    if not iso:
        return "no date"
    d = _local(iso)
    return f"{d:%a %b} {d.day}" + (f", {d:%I:%M %p}".replace(" 0", " ") if known else "")


def upcoming_events(sb: Client, club_id: int | None = None, days: int = DAYS_AHEAD) -> list[dict]:
    now = datetime.now(timezone.utc)
    q = lambda a, b: (
        sb.table("events").select(
            "id, name, club_id, post_id, starts_at, start_time_known, location, schedule_status, flags, checked_at, "
            "posts(id, shortcode, permalink, caption, previous_caption, caption_changed_at, rechecked_at, deleted_at, posted_at), "
            "clubs(id, instagram_username, name, last_checked_at)")
        .in_("status", ["approved", "pending"]).gte("starts_at", (now - timedelta(hours=6)).isoformat())
        .lt("starts_at", (now + timedelta(days=days)).isoformat())
        .range(a, b)
    )
    rows = fetch_all(q) if club_id is None else fetch_all(lambda a, b: q(a, b).eq("club_id", club_id))
    return rows


# New posts that say something's off ---------------------------------------------------

def scan(sb: Client, club: dict, posts: list[dict]) -> list[tuple[int, str]]:
    """Flags the club's upcoming events when one of these posts says an event is off.
    Returns (event id, note) for each event flagged."""
    flagged = []
    for post in posts:
        caption = post.get("caption") or ""
        m = CANCEL_WORDS.search(caption)
        if not m or CANCEL_WORDS.search(post.get("previous_caption") or ""):
            continue  # nothing new: an edited caption that already said it
        events = [e for e in upcoming_events(sb, club["id"]) if e["post_id"] != post["id"] or post.get("previous_caption")]
        # The events the post names, when it names any; otherwise all of the club's coming ones.
        named = [e for e in events if word_overlap(e["name"], caption) >= 0.6 or e["name"].lower() in caption.lower()]
        start = max(0, m.start() - 60)
        quote = " ".join(caption[start:m.end() + 60].split())
        for e in named or events:
            note = f"@{club['instagram_username']} posted “…{quote}…” ({post['permalink']}): is this event off?"
            if store.flag_event(sb, e["id"], "possibly_cancelled", note):
                flagged.append((e["id"], note))
    return flagged


# The daily check ------------------------------------------------------------------------

def due_today() -> bool:
    now = datetime.now(LOCAL_TZ)
    try:
        last = json.loads(STATE_FILE.read_text())["last_run"]
    except (OSError, ValueError, KeyError):
        last = None
    return now.hour >= DAILY_AFTER_HOUR and last != now.date().isoformat()


def _remember_run() -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps({"last_run": datetime.now(LOCAL_TZ).date().isoformat()}))


def daily(sb: Client, fetch_club: Callable[[Client, dict], None], force: bool = False,
          every_club: bool = False) -> list[tuple[int, str]]:
    """The day's check of upcoming events' posts (see the module docstring). Returns (event id, note) flagged.
    `every_club` fetches every club with an upcoming event, however recently it was fetched."""
    if not force and not due_today():
        return []
    started = datetime.now(timezone.utc)
    flagged: list[tuple[int, str]] = []
    events = [e for e in upcoming_events(sb) if e["post_id"]]
    print(f"Daily recheck: {len(events)} upcoming event(s) from Instagram in the next {DAYS_AHEAD} days")

    # 1. Fresh profiles: notices deleted posts and edited captions, and marks seen posts' events checked.
    clubs = {e["clubs"]["id"]: e["clubs"] for e in events}
    stale = [c for c in clubs.values() if every_club or not c["last_checked_at"]
             or datetime.fromisoformat(c["last_checked_at"]) < started - timedelta(hours=REFRESH_HOURS)]
    print(f"  fetching {len(stale)} club profile(s)" + ("" if every_club else f" not checked in the last {REFRESH_HOURS} hours"))
    for i, club in enumerate(stale):
        if i:
            time.sleep(random.uniform(*FETCH_DELAY_S))
        try:
            fetch_club(sb, club)
        except (Exception, SystemExit) as e:
            print(f"  @{club['instagram_username']}: fetch failed ({type(e).__name__}: {e})")
    events = [e for e in upcoming_events(sb) if e["post_id"]]

    # 2. Posts the profile didn't show (too old for its dozen): open their own page.
    unseen = {}
    for e in events:
        post = e["posts"] or {}
        if post.get("deleted_at"):
            continue
        if not e["checked_at"] or datetime.fromisoformat(e["checked_at"]) < started - timedelta(hours=REFRESH_HOURS):
            unseen[post["id"]] = (post, e["clubs"])
    print(f"  opening {len(unseen)} post page(s) not on their club's profile")
    for post, club in unseen.values():
        try:
            caption = fetch_post_page(club["instagram_username"], post["shortcode"],
                                      lambda a, c=club: (print_attempt(a), store.log_attempt(sb, c["id"], a)))
        except BlockedError as e:
            print(f"  post {post['shortcode']}: couldn't check ({e})")
            continue
        if caption is None:
            sb.table("posts").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("id", post["id"]).execute()
        else:
            store.mark_seen(sb, [post["id"]])
            if not store._same_caption(caption, post["caption"]) and not _truncated_match(caption, post["caption"]):
                sb.table("posts").update({"caption": caption, "previous_caption": post["caption"],
                                          "caption_changed_at": datetime.now(timezone.utc).isoformat()}).eq("id", post["id"]).execute()
    events = [e for e in upcoming_events(sb) if e["post_id"]]

    # 3. Deleted or unavailable posts: needs review, never cancelled automatically.
    for e in events:
        post = e["posts"] or {}
        if post.get("deleted_at") and e["schedule_status"] == "scheduled":
            note = (f"The Instagram post about this event ({post['permalink']}) was deleted or is unavailable; "
                    "it may be cancelled. Check with the club.")
            if store.flag_event(sb, e["id"], "instagram_post_deleted", note):
                flagged.append((e["id"], note))

    # 4. Edited captions: read again and compare.
    edited = {}
    for e in events:
        post = e["posts"] or {}
        if post.get("caption_changed_at") and (not post.get("rechecked_at") or post["rechecked_at"] < post["caption_changed_at"]):
            edited.setdefault(post["id"], (post, e["clubs"], []))[2].append(e)
    if edited:
        print(f"  re-reading {len(edited)} edited caption(s)")
        flagged += reread_edited(sb, list(edited.values()))

    _remember_run()
    return flagged


def _truncated_match(page: str, stored: str | None) -> bool:
    """The page's caption may be cut short: equal as far as it goes counts as the same."""
    a, b = " ".join(page.split()), " ".join((stored or "").split())
    return len(a) >= 40 and b.startswith(a.rstrip("…. "))


def reread_edited(sb: Client, items: list[tuple[dict, dict, list[dict]]]) -> list[tuple[int, str]]:
    """Reads each edited post again and flags its events whose details moved."""
    flagged = []
    pipeline = new_pipeline()
    for post, club, events in items:
        full = sb.table("posts").select("id, posted_at, caption, image_path").eq("id", post["id"]).single().execute().data
        image = None
        if full["image_path"]:
            try:
                image = store.load_image(sb, full["image_path"])
            except Exception as e:  # noqa: BLE001 - the caption alone still says what changed
                print(f"  could not load image for post {post['id']}: {e}")
        try:
            result = pipeline.extract(club_name=club["name"], username=club["instagram_username"],
                                      posted_at=datetime.fromisoformat(full["posted_at"]), caption=full["caption"], image=image)
        except (ExtractionError, ExtractorUnavailable) as e:
            print(f"  post {post['id']}: couldn't re-read ({e})")
            continue
        for purpose, usage in result.usages:
            store.log_usage(sb, post["id"], usage, f"recheck-{purpose}")
        new = [fe.event for fe in result.events]
        for e in events:
            changes = compare(e, new)
            if not changes:
                continue
            note = f"The club edited its caption ({post['permalink']}): " + "; ".join(changes) + ". Nothing was changed here."
            off = any(c.startswith("status") or c.startswith("no longer") for c in changes)
            if store.flag_event(sb, e["id"], "caption_changed", note):
                flagged.append((e["id"], note))
            if off:
                store.flag_event(sb, e["id"], "possibly_cancelled")
        sb.table("posts").update({"rechecked_at": datetime.now(timezone.utc).isoformat()}).eq("id", post["id"]).execute()
    return flagged


def compare(e: dict, new: list) -> list[str]:
    """What moved between the stored event and the post's events as read now."""
    if not new:
        return ["no longer in the post"]
    best = max(new, key=lambda n: name_similarity(e["name"], n.event_name))
    if len(new) > 1 and name_similarity(e["name"], best.event_name) < 0.3:
        return ["no longer in the post"]
    changes = []
    if best.start:
        start = best.start if best.start.tzinfo else best.start.replace(tzinfo=LOCAL_TZ)
        old = _local(e["starts_at"])
        if start.astimezone(LOCAL_TZ).date() != old.date():
            changes.append(f"date {_when(e['starts_at'], False)} → {_when(start.isoformat(), False)}")
        elif e["start_time_known"] and best.start_time_known and start != old:
            changes.append(f"time {_when(e['starts_at'])} → {_when(start.isoformat())}")
    if best.location and e["location"] and not same_place(best.location, e["location"]):
        changes.append(f"place {e['location']} → {best.location}")
    if best.schedule_status != e["schedule_status"]:
        changes.append(f"status {e['schedule_status']} → {best.schedule_status}")
    return changes


def scan_recent(sb: Client, days: int = 3) -> list[tuple[int, str]]:
    """scan() over the last few days' posts: for a first run, before fetches did it."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    posts = fetch_all(lambda a, b: sb.table("posts").select("id, club_id, caption, previous_caption, permalink, "
                                                            "clubs(id, instagram_username)").gte("posted_at", since).range(a, b))
    flagged = []
    for post in posts:
        flagged += scan(sb, post["clubs"], [post])
    return flagged


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Check that upcoming events are still on (flags only; never cancels).")
    parser.add_argument("--every-club", action="store_true",
                        help="fetch every club with an upcoming event, and scan the last 3 days' posts (a first run)")
    args = parser.parse_args()
    from run import fetch_club

    sb = store.connect()
    flagged = scan_recent(sb) if args.every_club else []
    flagged += daily(sb, fetch_club, force=True, every_club=args.every_club)
    print(f"{len(flagged)} event(s) flagged")
    for event_id, note in flagged:
        print(f"  #{event_id}: {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
