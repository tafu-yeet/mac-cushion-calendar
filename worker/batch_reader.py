"""Reads waiting posts through Anthropic's Message Batches API, at half the price
of reading them one call at a time (run.extract_post), for answers that take
minutes to an hour instead of seconds.

A post goes through up to two batches, as in extractors/two_stage.py: the first
reading, then, when it found events, the check. Between them the first reading
waits in posts.first_pass; posts.read_batch names the batch a post is in, and
llm_batches lists the batches still out. The rare tie-breaker still reads the
post straight away. Each worker run collects the batches that have ended, saves
what they found (auto_approve decides, as before), then sends what's waiting.

A request that failed for a passing reason (overloaded, expired) is sent again
on a later run; one the API rejected marks the post failed, like a direct call.

Usage (from worker/):
    python batch_reader.py      collect ended batches and send waiting posts once
"""

from __future__ import annotations

import sys
from dataclasses import asdict
from datetime import datetime

import anthropic
from storage3.exceptions import StorageException
from supabase import Client

import store
from extractors import ExtractionError, PostExtraction, TwoStageExtractor, Usage, new_pipeline
from settings import BATCH_MAX_POSTS

STAGES = {"e": "extract", "v": "verify"}


def run(sb: Client, pipeline: TwoStageExtractor | None = None) -> None:
    pipeline = pipeline or new_pipeline()
    client = anthropic.Anthropic()
    try:
        collect(sb, client, pipeline)
        send(sb, client, pipeline)
    except anthropic.APIConnectionError as e:
        print(f"Claude API unreachable ({e}); batches wait for the next run")
    except anthropic.APIStatusError as e:
        print(f"Claude API refused a batch request (HTTP {e.status_code}: {e}); batches wait for the next run")


def collect(sb: Client, client: anthropic.Anthropic, pipeline: TwoStageExtractor) -> None:
    """Save the results of every batch that has ended."""
    for b in sb.table("llm_batches").select("batch_id, stage, created_at").eq("status", "open").execute().data:
        batch = client.messages.batches.retrieve(b["batch_id"])
        if batch.processing_status != "ended":
            continue
        rows = {p["id"]: p for p in sb.table("posts").select("*, clubs(name)").eq("read_batch", b["batch_id"]).execute().data}
        counts = {"done": 0, "to check": 0, "again": 0, "failed": 0}
        for entry in client.messages.batches.results(b["batch_id"]):
            stage, _, post_id = entry.custom_id.partition("-")
            row = rows.get(post_id)
            if row is None:
                continue
            outcome = (read_first if STAGES[stage] == "extract" else read_check)(sb, pipeline, row, entry.result)
            counts[outcome] += 1
        # Anything without a usable result goes out again in a later batch.
        sb.table("posts").update({"read_batch": None}).eq("read_batch", b["batch_id"]).execute()
        sb.table("llm_batches").update({"status": "done", "ended_at": store.now().isoformat()}).eq("batch_id", b["batch_id"]).execute()
        print(f"batch {b['batch_id']} ({b['stage']}) ended: " + ", ".join(f"{n} {k}" for k, n in counts.items() if n))


def read_first(sb: Client, pipeline: TwoStageExtractor, row: dict, result) -> str:
    """The first reading came back: save the post, or keep the reading for the check."""
    if result.type != "succeeded":
        return give_up_or_retry(sb, row, result)
    try:
        first, usage = pipeline.first.read_batch_message(result.message)
    except ExtractionError as e:
        if e.usage:
            store.log_usage(sb, row["id"], e.usage, "extract")
        store.mark_extraction_failed(sb, row["id"], str(e))
        sb.table("posts").update({"read_batch": None}).eq("id", row["id"]).execute()
        return "failed"
    store.log_usage(sb, row["id"], usage, "extract")
    begun = pipeline.begin(first, usage)
    if pipeline.needs_check(begun):
        sb.table("posts").update({
            "read_batch": None,
            "first_pass": {"extraction": first.model_dump(mode="json"), "usage": asdict(usage)},
        }).eq("id", row["id"]).execute()
        return "to check"
    finish(sb, row, begun)
    return "done"


def read_check(sb: Client, pipeline: TwoStageExtractor, row: dict, result) -> str:
    """The check came back: merge it with the first reading and save the post."""
    if not row["first_pass"]:
        return "again"
    begun = pipeline.begin(PostExtraction.model_validate(row["first_pass"]["extraction"]), Usage(**row["first_pass"]["usage"]))
    if result.type != "succeeded":
        if result.type == "errored" and rejected(result):
            finish(sb, row, pipeline.check_failed(begun, Exception(error_text(result))))
            return "done"
        return "again"  # sent out again for the check; the first reading is kept
    try:
        second, usage = pipeline.check.read_batch_message(result.message)
    except ExtractionError as e:
        finish(sb, row, pipeline.check_failed(begun, e))
        return "done"
    finish(sb, row, pipeline.with_check(begun, second, usage, **post_input(sb, row)))
    return "done"


def finish(sb: Client, row: dict, result) -> None:
    for purpose, usage in result.usages:
        if purpose != "extract":  # the first reading's usage was logged when it came back
            store.log_usage(sb, row["id"], usage, purpose)
    events = store.save_extraction(sb, row, result)
    sb.table("posts").update({"read_batch": None, "first_pass": None}).eq("id", row["id"]).execute()
    published = sum(e["status"] == "approved" for e in events)
    print(f"  post {row['id']} ({row['permalink']}): {len(events)} event(s), {published} published"
          + (f", checked by {result.verified_by}" if result.verified_by else ""))


def rejected(result) -> bool:
    """The API turned the request down (a bad request), rather than failing for a while."""
    return getattr(getattr(result.error, "error", None), "type", "") == "invalid_request_error"


def error_text(result) -> str:
    error = getattr(result.error, "error", None)
    return f"{getattr(error, 'type', 'error')}: {getattr(error, 'message', '')}"


def give_up_or_retry(sb: Client, row: dict, result) -> str:
    if result.type == "errored" and rejected(result):
        store.mark_extraction_failed(sb, row["id"], error_text(result))
        sb.table("posts").update({"read_batch": None}).eq("id", row["id"]).execute()
        return "failed"
    return "again"  # overloaded, expired, or canceled: it goes out in a later batch


def post_input(sb: Client, row: dict) -> dict:
    image = None
    if row["image_path"]:
        try:
            image = store.load_image(sb, row["image_path"])
        except StorageException as e:
            print(f"  could not load image for post {row['id']}: {e}")
    return dict(club_name=row["clubs"]["name"], username=row["username"],
                posted_at=datetime.fromisoformat(row["posted_at"]), caption=row["caption"], image=image)


def send(sb: Client, client: anthropic.Anthropic, pipeline: TwoStageExtractor) -> None:
    """One batch of checks for posts whose first reading found events, one of first readings."""
    waiting = sb.table("posts").select("*, clubs(name)").eq("extraction_status", "pending").is_("read_batch", "null")
    checks = waiting.not_.is_("first_pass", "null").limit(BATCH_MAX_POSTS).execute().data
    firsts = (
        sb.table("posts").select("*, clubs(name)").eq("extraction_status", "pending").is_("read_batch", "null")
        .is_("first_pass", "null").order("posted_at", desc=True).limit(BATCH_MAX_POSTS).execute().data
    )
    for stage, rows, extractor in (("v", checks, pipeline.check), ("e", firsts, pipeline.first)):
        if not rows or extractor is None:
            continue
        requests = [{"custom_id": f"{stage}-{row['id']}", "params": extractor.batch_params(**post_input(sb, row))} for row in rows]
        batch = client.messages.batches.create(requests=requests)
        sb.table("llm_batches").insert({"batch_id": batch.id, "stage": STAGES[stage], "request_count": len(requests)}).execute()
        sb.table("posts").update({"read_batch": batch.id}).in_("id", [row["id"] for row in rows]).execute()
        print(f"sent {len(requests)} post(s) for {'the check' if stage == 'v' else 'a first reading'} in batch {batch.id}")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    run(store.connect())
    return 0


if __name__ == "__main__":
    sys.exit(main())
