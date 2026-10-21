"""Marks which upcoming events happen away from campus, for events read before
the reader decided it (extractors/base.py, off_campus). Haiku judges each event
from its place, name and club, a hundred at a time; events with no place stay on
campus. Fields a person set are left alone.

Usage (from worker/):
    python off_campus.py            list what would change
    python off_campus.py --apply    save it
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

import anthropic
from pydantic import BaseModel

from rubric import fetch_all
from settings import CAMPUS, CLAUDE_MODEL, LOCAL_TZ

PER_CALL = 100


class Place(BaseModel):
    id: int
    off_campus: bool


class Places(BaseModel):
    events: list[Place]


def judge(client: anthropic.Anthropic, rows: list[dict]) -> dict[int, bool]:
    listing = "\n".join(
        f"{r['id']} | {r['location']} | {r['name']} | {(r.get('clubs') or {}).get('name', '')}" for r in rows
    )
    known = ", ".join(f"{code} ({name})" for code, name in CAMPUS["campusLocations"].items())
    response = client.beta.messages.parse(
        model=CLAUDE_MODEL,
        max_tokens=16000,
        system=(
            f"For each {CAMPUS['school']} student club event (id | place | event | club), decide whether it happens "
            f"away from campus: a restaurant, café, bar, arena, park, trail, a venue elsewhere in {CAMPUS['city']} or "
            "another city, or another school. On campus means any campus building, room, lounge, field, or residence, "
            f"including ones not listed here: {known}; also the student centre's spaces (the Hub, Bridges, TwelvEighty), "
            "the athletic centre and stadium, and online events. 1280 Main St W is the campus's own address. A city "
            "name alone (\"Hamilton, ON\") doesn't say the event is away: mark off campus only when the place names "
            "somewhere that isn't campus. Answer for every id."
        ),
        messages=[{"role": "user", "content": listing}],
        output_format=Places,
    )
    return {p.id: p.off_campus for p in response.parsed_output.events}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Mark upcoming events that happen away from campus.")
    parser.add_argument("--apply", action="store_true", help="save the changes (otherwise just list them)")
    args = parser.parse_args()
    from store import connect

    sb = connect()
    today = datetime.now(LOCAL_TZ).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    rows = [
        r for r in fetch_all(lambda a, b: sb.table("events").select(
            "id, name, location, off_campus, reviewed_fields, clubs(name)").in_("status", ["pending", "approved"])
            .gte("starts_at", today).not_.is_("location", "null").range(a, b))
        if "off_campus" not in (r["reviewed_fields"] or [])
    ]
    client = anthropic.Anthropic()
    changed = 0
    for i in range(0, len(rows), PER_CALL):
        chunk = rows[i : i + PER_CALL]
        verdicts = judge(client, chunk)
        for r in chunk:
            off = verdicts.get(r["id"])
            if off is None or off == r["off_campus"]:
                continue
            changed += 1
            print(f"  #{r['id']} {'OFF' if off else 'on '} campus: {r['name'][:40]} @ {r['location']}")
            if args.apply:
                sb.table("events").update({"off_campus": off}).eq("id", r["id"]).execute()
    print(f"{changed} of {len(rows)} event(s) with a place {'changed' if args.apply else 'would change'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
