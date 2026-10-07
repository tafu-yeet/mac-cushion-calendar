"""Fallback backend: Apify's Instagram Scraper actor, called through its API.

Runs apify/instagram-scraper synchronously for one profile and returns its
posts. Only posts newer than `since` (the newest post already stored) are
requested, since Apify bills per result. Needs APIFY_TOKEN.
"""

from __future__ import annotations

from datetime import datetime, timezone

from curl_cffi import requests
from curl_cffi.requests.exceptions import RequestException

from settings import require

from .base import Attempt, AttemptLogger, FetchError, Post, UnavailableError

NAME = "apify"
RUN_URL = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items"
RESULTS_LIMIT = 12
TIMEOUT_S = 330  # Apify ends synchronous runs after 300 s


def fetch(username: str, since: datetime | None, on_attempt: AttemptLogger) -> list[Post]:
    payload = {
        "directUrls": [f"https://www.instagram.com/{username}/"],
        "resultsType": "posts",
        "resultsLimit": RESULTS_LIMIT,
    }
    if since:
        payload["onlyPostsNewerThan"] = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    status, size = None, 0
    try:
        resp = requests.post(
            RUN_URL,
            json=payload,
            headers={"Authorization": f"Bearer {require('APIFY_TOKEN')}"},
            timeout=TIMEOUT_S,
        )
        status, size = resp.status_code, resp.response_size
        if not 200 <= status < 300:
            raise FetchError(f"Apify HTTP {status}: {resp.text[:200]}")
        items = resp.json()
        errors = [item for item in items if "error" in item]
        if errors and len(errors) == len(items):
            raise UnavailableError(errors[0].get("errorDescription") or errors[0]["error"])
    except (FetchError, RequestException, ValueError) as e:
        on_attempt(Attempt(username, NAME, 1, status, "failed", size, "apify", str(e)))
        if isinstance(e, FetchError):
            raise
        raise FetchError(str(e)) from e

    posts = [to_post(item, username) for item in items if "error" not in item]
    on_attempt(Attempt(username, NAME, 1, status, "ok", size, "apify", f"{len(posts)} posts"))
    return posts


def to_post(item: dict, username: str) -> Post:
    return Post(
        id=str(item["id"]),
        shortcode=item["shortCode"],
        username=item.get("ownerUsername") or username,
        caption=(item.get("caption") or "").strip(),
        posted_at=datetime.fromisoformat(item["timestamp"]),
        image_url=item.get("displayUrl"),
        media_type=item.get("type") or "",
        raw=item,
    )
