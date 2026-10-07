"""LLM token usage and estimated cost per day, from the llm_usage log.

Costs are estimates from list prices (settings.MODEL_PRICES); the provider's
console (Anthropic or Google AI Studio) shows the exact bill.

Usage (from worker/):
    python usage.py [--days 7]
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import store
from settings import LOCAL_TZ

PAGE_SIZE = 1000  # Supabase's API returns at most 1000 rows per request


def fetch_rows(sb, since: datetime) -> list[dict]:
    rows, start = [], 0
    while True:
        page = (
            sb.table("llm_usage")
            .select("created_at, input_tokens, output_tokens, cost_usd")
            .gte("created_at", since.isoformat())
            .order("created_at")
            .range(start, start + PAGE_SIZE - 1)
            .execute()
            .data
        )
        rows += page
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Show LLM token usage and estimated cost.")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    rows = fetch_rows(store.connect(), since)
    if not rows:
        print(f"No LLM calls in the last {args.days} days.")
        return 0

    days: dict = defaultdict(lambda: {"calls": 0, "input": 0, "output": 0, "cost": 0.0})
    for r in rows:
        d = days[datetime.fromisoformat(r["created_at"]).astimezone(LOCAL_TZ).date()]
        d["calls"] += 1
        d["input"] += r["input_tokens"]
        d["output"] += r["output_tokens"]
        d["cost"] += float(r["cost_usd"] or 0)

    print(f"{'day':<12}{'calls':>7}{'input tok':>12}{'output tok':>12}{'est. cost':>11}")
    for day in sorted(days):
        d = days[day]
        print(f"{day!s:<12}{d['calls']:>7}{d['input']:>12,}{d['output']:>12,}{'$' + format(d['cost'], '.2f'):>11}")

    calls = sum(d["calls"] for d in days.values())
    cost = sum(d["cost"] for d in days.values())
    print(f"\nlast {args.days} days: {calls} calls, ~${cost:.2f} (~${cost / calls:.4f} per post)")
    print(f"at this rate: ~${cost / args.days * 30:.2f} per 30 days")
    return 0


if __name__ == "__main__":
    sys.exit(main())
