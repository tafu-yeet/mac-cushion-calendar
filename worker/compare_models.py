"""Compare an extractor (or the full pipeline) against stored Claude results.

Runs the candidate on every post Claude already extracted, without touching the
review queue, and reports where the two disagree on free food, event count, and
start times. Results are cached in worker/out/compare_<label>.json, so a run
stopped by a quota resumes where it left off.

Usage (from worker/):
    python compare_models.py --pipeline                     # first pass + date check
    python compare_models.py --extractor claude --model claude-haiku-4-5
    python compare_models.py --extractor gemini [--limit N]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime

import store
from extractors import ExtractionError, ExtractorUnavailable, new_extractor, new_pipeline
from settings import LOCAL_TZ, WORKER_DIR

RATE_LIMIT_WAIT_S = 65
MAX_WAITS_PER_POST = 3


def reference_posts(sb) -> list[dict]:
    posts = (
        sb.table("posts")
        .select("id, permalink, username, caption, posted_at, image_path, extraction, clubs(name)")
        .eq("extraction_status", "done").order("posted_at").execute().data
    )
    posts = [p for p in posts if (p["extraction"] or {}).get("model", "").startswith("claude-opus")]
    events = (
        sb.table("events").select("post_id, name, starts_at, has_free_food, food_description")
        .in_("post_id", [p["id"] for p in posts]).execute().data
    )
    by_post = defaultdict(list)
    for e in events:
        by_post[e["post_id"]].append(e)
    for p in posts:
        p["ref_events"] = by_post[p["id"]]
    return posts


def single_runner(extractor):
    def run(**post) -> dict:
        extraction, usage = extractor.extract(**post)
        return {
            "events": [e.model_dump(mode="json") for e in extraction.events],
            "input_tokens": usage.input_tokens, "output_tokens": usage.output_tokens,
            "cost_usd": usage.cost_usd or 0,
        }
    return run


def pipeline_runner(pipeline):
    def run(**post) -> dict:
        result = pipeline.extract(**post)
        usages = [u for _, u in result.usages]
        return {
            "events": [fe.event.model_dump(mode="json") | {"notes": fe.notes} for fe in result.events],
            "verified_by": result.verified_by,
            "input_tokens": sum(u.input_tokens for u in usages),
            "output_tokens": sum(u.output_tokens for u in usages),
            "cost_usd": sum(u.cost_usd or 0 for u in usages),
        }
    return run


def run_candidate(sb, run, posts: list[dict], cache_path) -> dict:
    results = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    todo = [p for p in posts if p["id"] not in results]
    print(f"{len(posts)} posts with Claude results; {len(posts) - len(todo)} already compared, {len(todo)} to run")
    for i, p in enumerate(todo, 1):
        image = store.load_image(sb, p["image_path"]) if p["image_path"] else None
        post = dict(club_name=p["clubs"]["name"], username=p["username"],
                    posted_at=datetime.fromisoformat(p["posted_at"]), caption=p["caption"], image=image)
        for waits in range(MAX_WAITS_PER_POST + 1):
            try:
                results[p["id"]] = run(**post)
                break
            except ExtractionError as e:
                results[p["id"]] = {"error": str(e)}
                break
            except ExtractorUnavailable as e:
                if not e.temporary or waits == MAX_WAITS_PER_POST:
                    print(f"Stopping: {e}")
                    return results
                print(f"  {e}\n  waiting {RATE_LIMIT_WAIT_S}s...")
                time.sleep(RATE_LIMIT_WAIT_S)
        cache_path.write_text(json.dumps(results, indent=1), encoding="utf-8")
        r = results[p["id"]]
        status = r.get("error") or f"{len(r['events'])} event(s), {sum(e['has_free_food'] for e in r['events'])} free food"
        print(f"  [{i}/{len(todo)}] {p['permalink']}: {status}")
    return results


def local_time(value: str | None, time_known: bool = True) -> str:
    if not value:
        return "no date"
    dt = datetime.fromisoformat(value)
    local = (dt if dt.tzinfo else dt.replace(tzinfo=LOCAL_TZ)).astimezone(LOCAL_TZ)
    # A midnight start is how the reference marks a date with no time.
    if not time_known or local.strftime("%H:%M") == "00:00":
        return local.strftime("%a %b %d") + " (time unknown)"
    return local.strftime("%a %b %d %H:%M")


def report(posts: list[dict], results: dict, name: str) -> None:
    compared = [p for p in posts if p["id"] in results and "error" not in results[p["id"]]]
    errors = [p for p in posts if p["id"] in results and "error" in results[p["id"]]]
    missed, extra, time_diff = [], [], []
    same_count = 0
    for p in compared:
        ref, cand = p["ref_events"], results[p["id"]]["events"]
        same_count += len(ref) == len(cand)
        ref_food = sorted(local_time(e["starts_at"]) for e in ref if e["has_free_food"])
        cand_food = sorted(local_time(e["start"], e.get("start_time_known", True)) for e in cand if e["has_free_food"])
        if ref_food and not cand_food:
            missed.append(p)
        elif cand_food and not ref_food:
            extra.append(p)
        elif ref_food and ref_food != cand_food:
            time_diff.append((p, ref_food, cand_food))

    both_food = sum(1 for p in compared if any(e["has_free_food"] for e in p["ref_events"])) - len(missed)
    tokens_in = sum(results[p["id"]]["input_tokens"] for p in compared)
    tokens_out = sum(results[p["id"]]["output_tokens"] for p in compared)
    print(f"\n=== {name} vs Claude Opus on {len(compared)} posts ({len(errors)} errors) ===")
    print(f"free food, both found:          {both_food} post(s)")
    print(f"free food, only Opus found:     {len(missed)} post(s)  <- {name} missed")
    print(f"free food, only {name} found:   {len(extra)} post(s)")
    print(f"free-food start times differ:   {len(time_diff)} post(s)")
    print(f"same number of events:          {same_count}/{len(compared)} posts")
    verified = [p for p in compared if results[p["id"]].get("verified_by")]
    if any("verified_by" in results[p["id"]] for p in compared):
        print(f"posts rechecked by the date check: {len(verified)}")
    cost = sum(results[p["id"]].get("cost_usd", 0) for p in compared)
    print(f"{name} tokens: {tokens_in:,} input / {tokens_out:,} output, ~${cost:.3f} "
          f"(~${cost / max(len(compared), 1):.4f} per post)")

    def caption(p: dict) -> str:
        return " ".join(p["caption"].split())[:220]

    for title, items in ((f"Only Opus found free food ({name} missed)", missed), (f"Only {name} found free food", extra)):
        if items:
            print(f"\n--- {title} ---")
        for p in items:
            print(f"{p['permalink']}  ({p['clubs']['name']})\n  caption: {caption(p)}")
            for label, evs, start_key in (("Opus", p["ref_events"], "starts_at"), (name, results[p["id"]]["events"], "start")):
                for e in evs:
                    if e["has_free_food"]:
                        print(f"  {label}: {e.get('name') or e.get('event_name')} | "
                              f"{local_time(e[start_key], e.get('start_time_known', True))} | {e['food_description']}")
                        if e.get("reason"):
                            print(f"    reason: {e['reason']}")
    if time_diff:
        print("\n--- Free food found by both, different start times ---")
        for p, ref_food, cand_food in time_diff:
            print(f"{p['permalink']}  Opus: {ref_food}  {name}: {cand_food}")
    noted = [(p, e) for p in compared for e in results[p["id"]]["events"] if e.get("notes")]
    if noted:
        print("\n--- Review notes the pipeline would show ---")
        for p, e in noted:
            for note in e["notes"]:
                print(f"{p['permalink']}  {e['event_name']}: {note}")
    for p in errors:
        print(f"error on {p['permalink']}: {results[p['id']]['error']}")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Compare an extractor against stored Claude Opus results.")
    parser.add_argument("--pipeline", action="store_true", help="test the full two-stage pipeline")
    parser.add_argument("--extractor", default="gemini", choices=["claude", "gemini"])
    parser.add_argument("--model", help="Claude model to test instead of CLAUDE_MODEL")
    parser.add_argument("--limit", type=int, help="only the first N posts")
    args = parser.parse_args()

    sb = store.connect()
    posts = reference_posts(sb)[: args.limit]
    if args.pipeline:
        label, run = "pipeline", pipeline_runner(new_pipeline())
    else:
        label, run = args.model or args.extractor, single_runner(new_extractor(args.extractor, args.model))
    cache_path = WORKER_DIR / "out" / f"compare_{label}.json"
    cache_path.parent.mkdir(exist_ok=True)
    results = run_candidate(sb, run, posts, cache_path)
    report(posts, results, label)
    return 0


if __name__ == "__main__":
    sys.exit(main())
