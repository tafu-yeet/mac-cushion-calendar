"""What every extraction backend shares: the output schema, prompt, and errors."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from settings import CAMPUS, LOCAL_TZ, MODEL_PRICES


class ExtractedEvent(BaseModel):
    event_name: str = Field(description="Short name for the event, e.g. 'Manhunt Game 2'.")
    event_type: str = Field(
        description="One lowercase label: social, workshop, info session, meeting, sports, "
        "cultural, fundraiser, competition, performance, volunteering, career, or other."
    )
    category: Literal["social", "sports", "arts", "learn", "give", "meetings", "other"] = Field(
        description="Which section of the calendar it belongs in; see Categories."
    )
    tags: list[str] = Field(description="A few lowercase keywords, e.g. ['games', 'outdoors'].")
    cost: Literal["free", "paid", "unknown"] = Field(description="What it costs to attend; see Other fields.")
    price: str | None = Field(description="The price as written, e.g. '$15', for paid events; otherwise null.")
    has_free_food: bool
    food_description: str | None = Field(
        description="What free food, in a few words for a student, e.g. 'pizza' or 'snacks and drinks'; null when none."
    )
    start: datetime | None = Field(description="ISO 8601 with the campus timezone's UTC offset.")
    start_time_known: bool = Field(
        description="False when the post gives the date but not the start time (start is then 00:00 that day)."
    )
    end: datetime | None = Field(description="ISO 8601 with the campus timezone's UTC offset.")
    location: str | None
    hosted_by: str | None = Field(
        description="Clubs or groups other than the posting account that run or co-run the event, "
        "with @handle if shown; null when the posting account runs it alone."
    )
    open_to_all: bool
    confidence: float = Field(
        description="0 to 1: how sure you are that the details, especially date, time, "
        "and free food, are correct."
    )
    reason: str = Field(
        description="One short sentence for the reviewer: why has_free_food is true or false, and anything uncertain."
    )


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
    return f"""You read Instagram posts from student clubs at {CAMPUS['school']} in {CAMPUS['city']} and pull out the events they announce. The results feed a campus calendar where students look for something to do, filtered by kind of event, cost, and free food. Each event is published only after a second reading or a person agrees with yours, so a wrong date or time does more harm than a missing detail.

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
- food_description says what food, as specifically as the post does, in a few plain words a student reads on an event card (e.g. "pizza", "snacks and drinks", "free bubble tea for the first 50 people"), or null when there is no free food. No brackets and no notes about the caption, flyer, or emojis: if the food isn't named, write "free food", and put any doubt in reason.

Categories
- social: mixers, parties, game and trivia nights, karaoke, bonfires, gaming tournaments, hangouts.
- sports: games to play or watch, fitness classes, sports tryouts, hikes and outdoor trips.
- arts: shows, concerts, open mics, theatre, dance, art and crafts, cultural celebrations, faith gatherings.
- learn: workshops, talks, info sessions, study sessions, networking and career events, academic, case, and coding competitions.
- give: fundraisers, volunteering, charity drives, blood drives, advocacy.
- meetings: club general meetings, AGMs, town halls, meet-the-exec sessions.
- other: anything that fits none of these, such as sales and openings.

Other fields
- cost is "paid" when attending needs a ticket, entry fee, or registration fee (put the price in price as written, e.g. "$15" or "$10 members, $15 others"); "free" when the post says it's free or nothing suggests a cost; "unknown" when it mentions tickets or registration without saying whether they cost money.
- open_to_all is true if any student can come: free, free sign-up, or a ticket anyone can buy. It is false if the event is limited to members or a specific group, such as one program, year, or level of study.
- location is the place as stated, with campus abbreviations expanded from the list below, e.g. "MUSC 230 (McMaster University Student Centre)". Use null if no place is given, including "link in bio". Give only the place: never notes about the flyer, the caption, or a changed room. If the post disagrees with itself, use the latest or most specific place and explain in reason.
- hosted_by lists the clubs or groups other than the posting account that run or co-run the event: the club whose event a hub or events page is sharing, or the partner in a collaboration ("x", "teaming up with", "partnering with"). Name them as the post does, with the @handle if shown, e.g. "McMaster Geeks (@mcmastergeeks)". Sponsors, venues, and shops are not hosts. Use null when the posting account runs the event alone.

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
