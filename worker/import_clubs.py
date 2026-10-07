"""Add clubs to the clubs table from a CSV.

The CSV needs a `username` column and optionally `name` and `include`; rows
whose include value isn't "yes" are skipped. Clubs already in the table are
left unchanged.

Usage (from worker/):
    python import_clubs.py ../clubs_review.csv [--inactive] [--poll-minutes 720]
"""

from __future__ import annotations

import argparse
import csv
import re
import sys

import store

USERNAME = re.compile(r"^[a-z0-9._]{1,30}$")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Add clubs from a CSV.")
    parser.add_argument("file")
    parser.add_argument("--inactive", action="store_true", help="add them switched off")
    parser.add_argument("--poll-minutes", type=int, help="polling interval (default: the table's, 120)")
    args = parser.parse_args()

    with open(args.file, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    clubs, invalid = {}, []
    for row in rows:
        if (row.get("include") or "yes").strip().lower() != "yes":
            continue
        username = row["username"].strip().lstrip("@").lower()
        if not USERNAME.match(username):
            invalid.append(username)
            continue
        club = {"instagram_username": username, "name": (row.get("name") or "").strip() or username,
                "active": not args.inactive}
        if args.poll_minutes:
            club["poll_interval_minutes"] = args.poll_minutes
        clubs[username] = club

    sb = store.connect()
    existing = {r["instagram_username"] for r in sb.table("clubs").select("instagram_username").execute().data}
    new = [club for username, club in clubs.items() if username not in existing]
    if new:
        sb.table("clubs").insert(new).execute()

    print(f"{len(rows)} rows, {len(clubs)} marked include=yes: added {len(new)}, "
          f"{len(clubs) - len(new)} already in the table" + (" (added as inactive)" if args.inactive and new else ""))
    if invalid:
        print(f"skipped invalid usernames: {', '.join(invalid)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
