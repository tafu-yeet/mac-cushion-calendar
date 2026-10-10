"""Supabase reads and writes for the worker, using the secret key (bypasses RLS)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from curl_cffi import requests
from supabase import Client, create_client

import auto_approve
from clean import clean_food, clean_place
from extractors import FinalEvent, PostResult, Usage
from fetchers import Attempt, Post
from settings import LOCAL_TZ, MAX_POST_AGE_DAYS, POST_IMAGE_BUCKET, require

IMAGE_TIMEOUT_S = 30
# Ask the CDN for formats Claude accepts (no AVIF/HEIC).
IMAGE_ACCEPT = "image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5"
IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


def connect() -> Client:
    return create_client(require("SUPABASE_URL"), require("SUPABASE_SECRET_KEY"))


def now() -> datetime:
    return datetime.now(timezone.utc)


# Clubs -------------------------------------------------------------------------

def due_clubs(sb: Client, username: str | None = None) -> list[dict]:
    """Active clubs whose polling interval has passed, or one club by username regardless."""
    if username:
        return sb.table("clubs").select("*").eq("instagram_username", username.lower()).execute().data
    clubs = sb.table("clubs").select("*").eq("active", True).execute().data
    return [
        c for c in clubs
        if c["last_checked_at"] is None
        or datetime.fromisoformat(c["last_checked_at"]) + timedelta(minutes=c["poll_interval_minutes"]) <= now()
    ]


def mark_checked(sb: Client, club_id: int) -> None:
    sb.table("clubs").update({"last_checked_at": now().isoformat()}).eq("id", club_id).execute()


def log_attempt(sb: Client, club_id: int, a: Attempt) -> None:
    sb.table("fetch_logs").insert({
        "club_id": club_id,
        "username": a.username,
        "backend": a.backend,
        "attempt": a.attempt,
        "http_status": a.http_status,
        "outcome": a.outcome,
        "response_bytes": a.response_bytes,
        "via": a.via,
        "detail": a.detail[:1000],
    }).execute()


# Posts -------------------------------------------------------------------------

def newest_post_time(sb: Client, club_id: int) -> datetime | None:
    rows = (
        sb.table("posts").select("posted_at").eq("club_id", club_id)
        .order("posted_at", desc=True).limit(1).execute().data
    )
    return datetime.fromisoformat(rows[0]["posted_at"]) if rows else None


def insert_new_posts(sb: Client, club_id: int, posts: list[Post], backend: str) -> list[dict]:
    """Store posts whose ids aren't stored yet and return the inserted rows.

    Posts older than MAX_POST_AGE_DAYS are stored as "skipped" so they never
    reach Claude (a newly added club's first fetch includes old posts).
    """
    if not posts:
        return []
    ids = [p.id for p in posts]
    known = {r["id"] for r in sb.table("posts").select("id").in_("id", ids).execute().data}
    cutoff = now() - timedelta(days=MAX_POST_AGE_DAYS)
    rows = [
        {
            "id": p.id,
            "club_id": club_id,
            "username": p.username,
            "shortcode": p.shortcode,
            "caption": p.caption,
            "posted_at": p.posted_at.isoformat(),
            "image_url": p.image_url,
            "permalink": p.permalink,
            "media_type": p.media_type,
            "fetched_via": backend,
            "extraction_status": "pending" if p.posted_at >= cutoff else "skipped",
            "raw": p.raw,
        }
        for p in posts
        if p.id not in known
    ]
    return sb.table("posts").insert(rows).execute().data if rows else []


def save_image(sb: Client, post: dict) -> str | None:
    """Download the post image straight from the CDN (no proxy) into storage."""
    if not post["image_url"]:
        return None
    resp = requests.get(
        post["image_url"], impersonate="chrome", headers={"Accept": IMAGE_ACCEPT}, timeout=IMAGE_TIMEOUT_S
    )
    resp.raise_for_status()
    content_type = resp.headers.get("content-type", "").split(";")[0].strip() or "image/jpeg"
    path = f"{post['username']}/{post['id']}.{IMAGE_EXTENSIONS.get(content_type, 'bin')}"
    sb.storage.from_(POST_IMAGE_BUCKET).upload(
        path, resp.content, {"content-type": content_type, "upsert": "true"}
    )
    sb.table("posts").update({"image_path": path}).eq("id", post["id"]).execute()
    return path


def load_image(sb: Client, path: str) -> bytes:
    return sb.storage.from_(POST_IMAGE_BUCKET).download(path)


# Extraction --------------------------------------------------------------------

def pending_posts(sb: Client, limit: int) -> list[dict]:
    return (
        sb.table("posts").select("*, clubs(name)").eq("extraction_status", "pending")
        .order("posted_at").limit(limit).execute().data
    )


def posts_with_upcoming_unreviewed_events(sb: Client) -> list[dict]:
    """Posts with a pending event from today on, read before events had a category, and nothing reviewed yet.

    So re-reading them loses no decision, and a run that stops partway can be repeated.
    """
    today = datetime.now(LOCAL_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    upcoming = (
        sb.table("events").select("post_id").eq("status", "pending").is_("extracted->>category", "null")
        .gte("starts_at", today.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")).execute().data
    )
    ids = sorted({e["post_id"] for e in upcoming})
    if not ids:
        return []
    reviewed = {e["post_id"] for e in sb.table("events").select("post_id").in_("post_id", ids).neq("status", "pending").execute().data}
    keep = [i for i in ids if i not in reviewed]
    return sb.table("posts").select("*, clubs(name)").in_("id", keep).order("posted_at").execute().data if keep else []


def save_extraction(sb: Client, post: dict, result: PostResult) -> list[dict]:
    """Save the post's events, confident ones approved and the rest pending, and mark the post done.

    Returns the event rows.
    """
    # Re-running a post replaces its unreviewed events instead of duplicating them.
    sb.table("events").delete().eq("post_id", post["id"]).eq("status", "pending").execute()
    rows = [_event_row(post, fe) for fe in result.events]
    # Each is compared with events already saved, not with this post's others (the model split those).
    club_name = (post.get("clubs") or {}).get("name", "")
    for row in rows:
        auto_approve.review(sb, row, result.verified_by, club_name)
    if rows:
        sb.table("events").insert(rows).execute()
    extraction = {"is_event": result.is_event, "reason": result.reason, "model": result.first_model,
                  "verified_by": result.verified_by}
    if result.verified_by:
        extraction["first_pass"] = result.first_pass.model_dump(mode="json")
    sb.table("posts").update({
        "extraction_status": "done",
        "extraction": extraction,
        "extraction_error": None,
        "extracted_at": now().isoformat(),
    }).eq("id", post["id"]).execute()
    return rows


def log_usage(sb: Client, post_id: str, usage: Usage, purpose: str = "extract") -> None:
    cost = usage.cost_usd
    sb.table("llm_usage").insert({
        "post_id": post_id,
        "purpose": purpose,
        "model": usage.model,
        "stop_reason": usage.stop_reason,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
        "cache_creation_input_tokens": usage.cache_creation_input_tokens,
        "cache_read_input_tokens": usage.cache_read_input_tokens,
        "cost_usd": round(cost, 6) if cost is not None else None,
    }).execute()


def reset_failed_extractions(sb: Client) -> int:
    rows = (
        sb.table("posts").update({"extraction_status": "pending", "extraction_error": None})
        .eq("extraction_status", "failed").execute().data
    )
    return len(rows)


def mark_extraction_failed(sb: Client, post_id: str, error: str) -> None:
    sb.table("posts").update({
        "extraction_status": "failed",
        "extraction_error": error[:1000],
        "extracted_at": now().isoformat(),
    }).eq("id", post_id).execute()


def _event_row(post: dict, fe: FinalEvent) -> dict:
    e = fe.event
    return {
        "post_id": post["id"],
        "club_id": post["club_id"],
        "status": "pending",
        # Every row in one insert needs the same keys, so these are always present.
        "auto_approved": False,
        "reviewed_at": None,
        "name": e.event_name,
        "event_type": e.event_type.strip().lower() or "other",
        "category": e.category,
        "tags": [t.strip().lower() for t in e.tags if t.strip()],
        "cost": e.cost,
        "price": e.price if e.cost == "paid" else None,
        "has_free_food": e.has_free_food,
        "food_description": clean_food(e.food_description),
        "starts_at": _localized(e.start),
        "start_time_known": e.start_time_known,
        "ends_at": _localized(e.end),
        "location": clean_place(e.location),
        "hosted_by": e.hosted_by,
        "open_to_all": e.open_to_all,
        "confidence": min(max(e.confidence, 0.0), 1.0),
        "reason": e.reason,
        "review_notes": fe.notes,
        "extracted": e.model_dump(mode="json"),
        "model": fe.model,
    }


def _localized(dt: datetime | None) -> str | None:
    """ISO string; a datetime without an offset is taken as campus local time."""
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=LOCAL_TZ)).isoformat()
