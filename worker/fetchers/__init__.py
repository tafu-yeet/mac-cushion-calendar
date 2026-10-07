"""fetch_posts(username): a club's recent Instagram posts from the configured backend.

FETCH_BACKEND picks the backend. "auto" (the default) uses the profile page
through residential proxies and falls back to Apify when all of its attempts
are blocked; "primary" or "apify" forces one.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import settings

from . import apify, profile_page
from .base import (
    Attempt,
    AttemptLogger,
    BlockedError,
    FetchError,
    Post,
    UnavailableError,
    print_attempt,
)

BACKENDS = {profile_page.NAME: profile_page, apify.NAME: apify}

__all__ = [
    "Attempt", "AttemptLogger", "BlockedError", "FetchError", "FetchResult", "Post",
    "UnavailableError", "fetch_posts", "print_attempt",
]


@dataclass
class FetchResult:
    posts: list[Post]
    backend: str


def fetch_posts(
    username: str,
    since: datetime | None = None,
    on_attempt: AttemptLogger = print_attempt,
    backend: str | None = None,
) -> FetchResult:
    """Return the club's recent posts; `since` is the newest post already stored."""
    choice = backend or settings.FETCH_BACKEND
    if choice != "auto":
        if choice not in BACKENDS:
            raise SystemExit(f"Unknown FETCH_BACKEND {choice!r}; use auto, primary, or apify.")
        return FetchResult(BACKENDS[choice].fetch(username, since, on_attempt), choice)

    try:
        return FetchResult(profile_page.fetch(username, since, on_attempt), profile_page.NAME)
    except BlockedError:
        return FetchResult(apify.fetch(username, since, on_attempt), apify.NAME)
