"""What every extraction backend shares: the output schema, prompt, and errors."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Protocol

from pydantic import BaseModel, Field

from settings import CAMPUS, LOCAL_TZ, MODEL_PRICES


class ExtractedEvent(BaseModel):
    event_name: str = Field(description="Short name for the event, e.g. 'Manhunt Game 2'.")
    event_type: str = Field(
        description="One lowercase label: social, workshop, info session, meeting, sports, "
        "cultural, fundraiser, competition, performance, volunteering, career, or other."
    )
    tags: list[str] = Field(description="A few lowercase keywords, e.g. ['games', 'outdoors'].")
    has_free_food: bool
    food_description: str | None
    start: datetime | None = Field(description="ISO 8601 with the campus timezone's UTC offset.")
    start_time_known: bool = Field(
        description="False when the post gives the date but not the start time (start is then 00:00 that day)."
    )
    end: datetime | None = Field(description="ISO 8601 with the campus timezone's UTC offset.")
    location: str | None
    open_to_all: bool
    confidence: float = Field(
        description="0 to 1: how sure you are that the details, especially date, time, "
        "and free food, are correct."
    )
    reason: str = Field(description="One short sentence: why has_free_food is true or false, and anything uncertain.")


class PostExtraction(BaseModel):
    is_event: bool = Field(description="True if the post announces or invites people to at least one event.")
    reason: str = Field(description="One short sentence on why this post is or isn't an event announcement.")
    events: list[ExtractedEvent]


@dataclass
class Usage:
    """Tokens one model call used, for the llm_usage log."""

    model: str
    stop_reason: str | None
    input_tokens: int
    output_tokens: int  # includes thinking tokens
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_write_multiplier: float = 1.25  # 1.25 for 5-minute cache writes, 2.0 for 1-hour

    @property
    def cost_usd(self) -> float | None:
        """Estimate from list prices; None for a model missing from MODEL_PRICES."""
        # Responses may name a dated snapshot, e.g. claude-haiku-4-5-20251001.
        prices = MODEL_PRICES.get(re.sub(r"-\d{8}$", "", self.model))
        if prices is None:
            return None
        input_price, output_price, cache_read_price = prices
        return (
            self.input_tokens * input_price
            + self.cache_creation_input_tokens * input_price * self.cache_write_multiplier
            + self.cache_read_input_tokens * cache_read_price
            + self.output_tokens * output_price
        ) / 1_000_000


class ExtractionError(Exception):
    """The model returned no usable extraction for this post."""

    def __init__(self, message: str, usage: Usage | None = None):
        super().__init__(message)
        self.usage = usage  # a failed call can still use (and bill) tokens


class ExtractorUnavailable(Exception):
    """The API is down, rate limited, or misconfigured: stop and retry next run."""

    def __init__(self, message: str, temporary: bool = True):
        super().__init__(message)
        self.temporary = temporary  # False for a bad key or model name: waiting won't help


class Extractor(Protocol):
    name: str

    def extract(
        self, *, club_name: str, username: str, posted_at: datetime, caption: str, image: bytes | None
    ) -> tuple[PostExtraction, Usage]: ...


def system_prompt() -> str:
    locations = "\n".join(f"- {abbr}: {name}" for abbr, name in CAMPUS["campusLocations"].items())
    return f"""You read Instagram posts from student clubs at {CAMPUS['school']} in {CAMPUS['city']} and pull out the events they announce. The results feed a campus calendar that shows students which public events give out free food, after a person reviews each one.

Each post comes with the club's name, when it was posted, its caption, and usually its image. The image is often a flyer with details the caption leaves out, so read both.

Events
- List every distinct event the post announces or invites people to, one entry per event. A weekly schedule becomes several entries; the same event mentioned twice is one entry.
- Recaps of past events, merch drops, exec recruitment, online giveaways, and general news are not events. For those, set is_event to false and return no events.

Dates and times
- The campus timezone is {CAMPUS['timezone']}. Give start and end as ISO 8601 datetimes with that timezone's UTC offset on the event's date, e.g. 2026-10-07T18:00:00-04:00.
- Resolve relative dates ("tomorrow", "this Thursday", "next week") against the posting time. "This Thursday" means the next Thursday on or after the posting date. Use the calendar that comes with each post to turn weekdays into dates; when a flyer lists weekdays under a date range, take each date from that range.
- Only use a start time that is written in the caption or image; never estimate one. If the post gives a date but no time, set start to 00:00 that day and start_time_known to false.
- Leave end null if no end time is given, and start null if no date can be worked out.

Free food
- has_free_food is true only when attendees can get food, snacks, drinks, or treats without paying, whether the whole event is free or the food is handed out free at it.
- Food for sale, bake sales, and food covered by a paid ticket don't count. Prizes, raffles, merch, and free tickets are not food.
- food_description says what food, as specifically as the post does (e.g. "pizza", "free bubble tea for the first 50 people"), or null when there is no free food.

Other fields
- open_to_all is true if any student can come, including events with free sign-up. It is false if the event needs a paid ticket or membership, or is limited to a specific group.
- location is the place as stated, with campus abbreviations expanded from the list below, e.g. "MUSC 230 (McMaster University Student Centre)". Use null if no place is given, including "link in bio".

Known campus locations
{locations}"""


CALENDAR_WEEKS = 5  # the week before the post, its week, and three after


def calendar_around(day: date) -> str:
    """Weeks of dates around `day`, one line per Monday-to-Sunday week."""
    monday = day - timedelta(days=day.weekday() + 7)
    weeks = []
    for w in range(CALENDAR_WEEKS):
        days = [monday + timedelta(days=7 * w + d) for d in range(7)]
        weeks.append(" · ".join(f"{d:%a %b} {d.day}" for d in days))
    return "\n".join(weeks)


def post_text(club_name: str, username: str, posted_at: datetime, caption: str, has_image: bool) -> str:
    local = posted_at.astimezone(LOCAL_TZ)
    return (
        f"Club: {club_name} (@{username})\n"
        f"Posted: {local:%A %Y-%m-%d %H:%M} ({local:%Z}, UTC{local:%z})\n"
        f"Image: {'attached' if has_image else 'not available'}\n\n"
        f"Calendar:\n{calendar_around(local.date())}\n\n"
        f"Caption:\n{caption or '(no caption)'}"
    )


def image_media_type(data: bytes) -> str | None:
    """Media type from the file's magic bytes, for formats both APIs accept."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None
