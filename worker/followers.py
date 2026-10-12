"""Records clubs' follower counts now, instead of at each club's next scheduled check.

Fetches each profile page through the proxy (logged in fetch_logs like any
fetch) and saves the follower count; it stores no posts.

Usage (from worker/):
    python followers.py          active clubs without a count yet
    python followers.py --all    every active club
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from datetime import datetime, timezone

import store
from fetchers import profile_page
from fetchers.base import FetchError

DELAY_S = (3.0, 6.0)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Record clubs' follower counts.")
    parser.add_argument("--all", action="store_true", help="refresh every active club, not just those without a count")
    args = parser.parse_args()

    sb = store.connect()
    query = sb.table("clubs").select("id, instagram_username").eq("active", True)
    if not args.all:
        query = query.is_("followers", "null")
    clubs = query.order("id").execute().data
    print(f"{len(clubs)} club(s) to check")

    saved = 0
    for i, club in enumerate(clubs):
        if i:
            time.sleep(random.uniform(*DELAY_S))
        try:
            _, followers = profile_page.fetch(
                club["instagram_username"], None, lambda a, club_id=club["id"]: store.log_attempt(sb, club_id, a)
            )
        except FetchError as e:
            print(f"  @{club['instagram_username']}: {e}")
            continue
        if followers is not None:
            sb.table("clubs").update(
                {"followers": followers, "followers_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", club["id"]).execute()
            saved += 1
        print(f"  @{club['instagram_username']}: {followers}")
    print(f"saved {saved} follower count(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
