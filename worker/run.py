"""One worker cycle: fetch clubs that are due, store new posts and images, extract events.

Run it on a schedule (for example every 15 minutes). Each club is fetched only
once its polling interval has passed. Nothing is published: every extracted
event lands in the review queue as "pending". Every LLM call is logged to
llm_usage (see usage.py for totals); EXTRACTOR picks Claude or Gemini.

Usage (from worker/):
    python run.py                  # one full cycle
    python run.py --club USERNAME  # fetch this club now, even if it isn't due
    python run.py --no-extract     # fetch and store only
    python run.py --extract-only   # only process posts waiting for extraction
    python run.py --retry-failed   # also re-queue posts whose extraction failed
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from collections import defaultdict
from datetime import datetime

from curl_cffi.requests.exceptions import RequestException
from storage3.exceptions import StorageException
from supabase import Client

import store
from extractors import ExtractionError, ExtractorUnavailable, TwoStageExtractor, Usage, new_pipeline
from fetchers import Attempt, FetchError, fetch_posts, print_attempt
from settings import MAX_EXTRACTIONS_PER_RUN

CLUB_DELAY_S = (5.0, 15.0)


def fetch_club(sb: Client, club: dict) -> None:
    username = club["instagram_username"]

    def on_attempt(a: Attempt) -> None:
        print_attempt(a)
        store.log_attempt(sb, club["id"], a)

    try:
        result = fetch_posts(username, since=store.newest_post_time(sb, club["id"]), on_attempt=on_attempt)
    except FetchError as e:
        print(f"  @{username}: fetch failed ({e})")
        store.mark_checked(sb, club["id"])
        return

    new_rows = store.insert_new_posts(sb, club["id"], result.posts, result.backend)
    to_extract = [row for row in new_rows if row["extraction_status"] == "pending"]
    for row in to_extract:
        try:
            store.save_image(sb, row)
        except (RequestException, StorageException) as e:
            # Extraction still runs on the caption alone.
            print(f"  image download failed for post {row['id']}: {e}")
    store.mark_checked(sb, club["id"])
    print(
        f"  @{username}: {len(result.posts)} posts via {result.backend}, "
        f"{len(new_rows)} new, {len(to_extract)} queued for extraction"
    )


def extract_pending(sb: Client, limit: int) -> None:
    rows = store.pending_posts(sb, limit)
    if not rows:
        print("No posts waiting for extraction.")
        return
    pipeline = new_pipeline()
    used: list[Usage] = []
    try:
        for row in rows:
            if not extract_post(sb, pipeline, row, used):
                break
    finally:
        print_usage_total(used)


def extract_post(sb: Client, pipeline: TwoStageExtractor, row: dict, used: list[Usage]) -> bool:
    """Extract one post and queue its events. Returns False if the LLM API is unavailable."""
    image = None
    if row["image_path"]:
        try:
            image = store.load_image(sb, row["image_path"])
        except StorageException as e:
            print(f"  could not load image for post {row['id']}: {e}")

    try:
        result = pipeline.extract(
            club_name=row["clubs"]["name"],
            username=row["username"],
            posted_at=datetime.fromisoformat(row["posted_at"]),
            caption=row["caption"],
            image=image,
        )
    except ExtractorUnavailable as e:
        # Affects every post (outage, rate limit, bad key), so don't mark this one failed.
        print(f"{e}; leaving the remaining posts for the next run.")
        return False
    except ExtractionError as e:
        tokens = ""
        if e.usage:
            record_usage(sb, row["id"], e.usage, used, "extract")
            tokens = f"; {describe(e.usage)}"
        print(f"  post {row['id']}: extraction failed ({e}{tokens})")
        store.mark_extraction_failed(sb, row["id"], str(e))
        return True

    for purpose, usage in result.usages:
        record_usage(sb, row["id"], usage, used, purpose)
    events = store.save_extraction(sb, row, result)
    food = sum(e["has_free_food"] for e in events)
    checked = f", rechecked by {result.verified_by}" if result.verified_by else ""
    print(
        f"  post {row['id']} ({row['permalink']}): {len(events)} event(s), {food} with free food{checked}; "
        + "; ".join(describe(u) for _, u in result.usages)
    )
    for e in events:
        when = (e["starts_at"] or "no date") + ("" if e["start_time_known"] else " (time unknown)")
        print(f"    - {e['name']} | {when} | {e['location']} | free food: {e['food_description'] or 'no'}")
        for note in e["review_notes"]:
            print(f"      note: {note}")
    return True


def record_usage(sb: Client, post_id: str, usage: Usage, used: list[Usage], purpose: str) -> None:
    store.log_usage(sb, post_id, usage, purpose)
    used.append(usage)


def describe(usage: Usage) -> str:
    return f"{usage.model}: {usage.input_tokens:,} in / {usage.output_tokens:,} out tokens, ~${usage.cost_usd or 0:.4f}"


def print_usage_total(used: list[Usage]) -> None:
    by_model: dict[str, list[Usage]] = defaultdict(list)
    for u in used:
        by_model[u.model].append(u)
    for model, calls in by_model.items():
        cost = sum(u.cost_usd or 0 for u in calls)
        print(
            f"{model}: {len(calls)} call(s), {sum(u.input_tokens for u in calls):,} input / "
            f"{sum(u.output_tokens for u in calls):,} output tokens, ~${cost:.4f}"
        )
    if len(by_model) > 1:
        print(f"total: ~${sum(u.cost_usd or 0 for u in used):.4f}")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Run one worker cycle.")
    parser.add_argument("--club", help="fetch this club now, even if it isn't due")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--no-extract", action="store_true", help="fetch and store only")
    group.add_argument("--extract-only", action="store_true", help="only extract waiting posts")
    parser.add_argument("--retry-failed", action="store_true", help="queue failed extractions again")
    args = parser.parse_args()

    sb = store.connect()
    if args.retry_failed:
        print(f"{store.reset_failed_extractions(sb)} failed post(s) queued for extraction again")
    if not args.extract_only:
        clubs = store.due_clubs(sb, args.club)
        if args.club and not clubs:
            print(f"No club @{args.club} in the clubs table.")
            return 1
        print(f"{len(clubs)} club(s) to fetch")
        random.shuffle(clubs)
        for i, club in enumerate(clubs):
            if i:
                time.sleep(random.uniform(*CLUB_DELAY_S))
            fetch_club(sb, club)

    if not args.no_extract:
        extract_pending(sb, MAX_EXTRACTIONS_PER_RUN)
    return 0


if __name__ == "__main__":
    sys.exit(main())
