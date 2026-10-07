"""Print a club's recent posts without touching the database.

Usage (from worker/):
    python -m fetchers [username] [--backend auto|primary|apify] [--since 2026-10-01]
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from settings import LOCAL_TZ

from . import FetchError, fetch_posts


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Print a club's recent Instagram posts.")
    parser.add_argument("username", nargs="?", default="macmanhunt")
    parser.add_argument("--backend", choices=["auto", "primary", "apify"])
    parser.add_argument("--since", type=datetime.fromisoformat, help="only posts newer than this (Apify)")
    args = parser.parse_args()
    since = args.since.replace(tzinfo=args.since.tzinfo or LOCAL_TZ) if args.since else None

    try:
        result = fetch_posts(args.username, since=since, backend=args.backend)
    except FetchError as e:
        print(f"\nFAILED: {e}")
        return 1

    print(f"\n@{args.username}: {len(result.posts)} posts via {result.backend}")
    for i, post in enumerate(result.posts, 1):
        print(f"\n[{i}] {post.posted_at.astimezone(LOCAL_TZ):%a %Y-%m-%d %H:%M %Z}  {post.media_type}")
        print(f"    id={post.id}  {post.permalink}")
        for line in (post.caption or "(no caption)").splitlines():
            print(f"    | {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
