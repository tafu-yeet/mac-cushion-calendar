"""Run the extraction pipeline on one stored post without saving anything.

Usage (from worker/):
    python -m extractors POST_ID [--no-check]
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

import store

from . import new_pipeline


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Run the extraction pipeline on one stored post.")
    parser.add_argument("post_id")
    parser.add_argument("--no-check", action="store_true", help="first pass only, skip the date check")
    args = parser.parse_args()

    sb = store.connect()
    rows = sb.table("posts").select("*, clubs(name)").eq("id", args.post_id).execute().data
    if not rows:
        print(f"No stored post with id {args.post_id}")
        return 1
    row = rows[0]
    image = store.load_image(sb, row["image_path"]) if row["image_path"] else None
    result = new_pipeline(check=not args.no_check).extract(
        club_name=row["clubs"]["name"],
        username=row["username"],
        posted_at=datetime.fromisoformat(row["posted_at"]),
        caption=row["caption"],
        image=image,
    )
    for purpose, u in result.usages:
        print(f"{purpose}: {u.model}, {u.input_tokens:,} in / {u.output_tokens:,} out, ~${u.cost_usd or 0:.4f} (not logged)")
    print(f"is_event={result.is_event}: {result.reason}")
    for fe in result.events:
        print(f"\n[{fe.model}] {fe.event.model_dump_json(indent=2)}")
        for note in fe.notes:
            print(f"  note: {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
