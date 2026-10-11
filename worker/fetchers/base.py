"""Types shared by the Instagram fetch backends."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable


@dataclass
class Post:
    id: str  # Instagram media id; the same across backends
    shortcode: str
    username: str
    caption: str
    posted_at: datetime
    image_url: str | None
    media_type: str
    raw: dict = field(repr=False)

    @property
    def permalink(self) -> str:
        return f"https://www.instagram.com/p/{self.shortcode}/"

    @property
    def is_video(self) -> bool:
        """Reels and other videos: "clips"/"igtv" (or media_type 2) from the profile page, "Video" from Apify."""
        return (
            self.media_type in ("clips", "igtv", "Video")
            or self.raw.get("media_type") == 2
            or self.raw.get("productType") == "clips"
        )


@dataclass
class Attempt:
    """One request to Instagram or Apify, for the fetch log."""

    username: str
    backend: str
    attempt: int
    http_status: int | None
    outcome: str  # ok | retry | failed
    response_bytes: int
    via: str = ""  # proxy host:port, never credentials
    detail: str = ""


AttemptLogger = Callable[[Attempt], None]


class FetchError(Exception):
    """The backend could not return posts."""


class BlockedError(FetchError):
    """Every attempt was blocked or throttled; another backend may work."""


class UnavailableError(FetchError):
    """The profile can't be fetched by any backend (private or missing)."""


def print_attempt(a: Attempt) -> None:
    print(
        f"fetch club={a.username} backend={a.backend} via={a.via or '-'} attempt={a.attempt} "
        f"status={a.http_status or '-'} bytes={a.response_bytes} outcome={a.outcome}"
        + (f" ({a.detail})" if a.detail else ""),
        flush=True,
    )
