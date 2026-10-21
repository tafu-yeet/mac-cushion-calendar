"""Two-stage extraction: a cheap first pass on every post, and a stronger model
rechecking every post where the first pass found an event.

The check exists for dates: in testing, Haiku found nearly every event but got
about one date in sixteen wrong (once at 0.9 confidence, so confidence can't
decide what to recheck). When the check runs:
- its events replace the first pass's, so its dates, times, and places win;
- if it finds no free food where the first pass did, the event keeps the free
  food and gets a review note: a "no" from the check never hides a find;
- other disagreements on date, time, or room, and events only one model
  found, also become review notes. A note keeps an event from being
  published automatically (auto_approve.py), so "no notes" means both models
  read the event the same way.

When there are disagreements, a third, stronger model reads the post as a
tie-breaker. Where it agrees with an event's date, time, and room, the
disagreement notes go: two of three readings agree. A food dispute goes only
when the tie-breaker also finds the free food, so a find is never dropped.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from difflib import SequenceMatcher

from settings import LOCAL_TZ

from .base import ExtractedEvent, ExtractionError, Extractor, ExtractorUnavailable, PostExtraction, Usage


@dataclass
class FinalEvent:
    event: ExtractedEvent
    model: str  # the model whose fields these are
    notes: list[str] = field(default_factory=list)


@dataclass
class PostResult:
    is_event: bool
    reason: str
    events: list[FinalEvent]
    first_pass: PostExtraction
    first_model: str
    verified_by: str | None  # None when the check didn't run or failed
    usages: list[tuple[str, Usage]]  # (purpose, usage): purpose is "extract", "verify", or "tiebreak"
    settled_by: str | None = None  # the tie-breaker model, when it settled at least one disagreement


class TwoStageExtractor:
    def __init__(self, first: Extractor, check: Extractor | None, tiebreak: Extractor | None = None):
        self.first = first
        self.check = check
        self.tiebreak = tiebreak

    def extract(self, **post) -> PostResult:
        """Errors from the first pass propagate; a failed check only adds a note."""
        first, first_usage = self.first.extract(**post)
        result = self.begin(first, first_usage)
        if not self.needs_check(result):
            return result
        try:
            second, check_usage = self.check.extract(**post)
        except (ExtractionError, ExtractorUnavailable) as e:
            return self.check_failed(result, e)
        return self.with_check(result, second, check_usage, **post)

    # The steps of extract(), for reading in batches (batch_reader.py), where the
    # first reading and the check come back in separate batches.

    def begin(self, first: PostExtraction, first_usage: Usage) -> PostResult:
        """The result after the first reading alone."""
        return PostResult(
            first.is_event, first.reason, [FinalEvent(e, first_usage.model) for e in first.events],
            first, first_usage.model, None, [("extract", first_usage)],
        )

    def needs_check(self, result: PostResult) -> bool:
        return self.check is not None and bool(result.first_pass.events)

    def check_failed(self, result: PostResult, e: Exception) -> PostResult:
        if isinstance(e, ExtractionError) and e.usage:
            result.usages.append(("verify", e.usage))
        for fe in result.events:
            fe.notes.append(f"Date check didn't run ({e}); dates are unverified.")
        return result

    def with_check(self, result: PostResult, second: PostExtraction, check_usage: Usage, **post) -> PostResult:
        """Merges the check into the result; when they disagree, the tie-breaker reads the post (now, not batched)."""
        first, usages = result.first_pass, result.usages
        usages.append(("verify", check_usage))
        result.events = merge(first.events, result.first_model, second.events, check_usage.model)
        result.is_event = second.is_event or first.is_event
        result.reason = second.reason
        result.verified_by = check_usage.model

        if self.tiebreak is not None and any(settleable(fe) for fe in result.events):
            try:
                third, third_usage = self.tiebreak.extract(**post)
            except (ExtractionError, ExtractorUnavailable) as e:
                if isinstance(e, ExtractionError) and e.usage:
                    usages.append(("tiebreak", e.usage))
                return result  # the notes stay, so a person decides
            usages.append(("tiebreak", third_usage))
            if settle(result.events, third.events):
                result.settled_by = third_usage.model
        return result


def merge(first: list[ExtractedEvent], first_model: str, second: list[ExtractedEvent], check_model: str) -> list[FinalEvent]:
    a_name, b_name = short_name(first_model), short_name(check_model)
    final = [FinalEvent(e.model_copy(), check_model) for e in second]
    pairs = match(first, second)

    for i, a in enumerate(first):
        if i not in pairs:
            if a.has_free_food:
                final.append(FinalEvent(a, first_model, [
                    f"Only {a_name} found this event (free food: {a.food_description}); {b_name} didn't. Check the post."
                ]))
            continue
        fe = final[pairs[i]]
        b = fe.event
        if when(a) != when(b):
            fe.notes.append(f"{a_name} said {when(a)}, {b_name} said {when(b)}; using {b_name}'s.")
        if not same_place(a.location, b.location):
            fe.notes.append(f"{a_name} said it's at {a.location}, {b_name} said {b.location}; using {b_name}'s.")
        if a.has_free_food and not b.has_free_food:
            b.has_free_food, b.food_description = True, a.food_description
            fe.notes.append(f"{a_name} found free food ({a.food_description}); {b_name} found none. Check the post.")
        elif b.has_free_food and not a.has_free_food:
            fe.notes.append(f"{b_name} found free food that {a_name} missed.")

    for j, fe in enumerate(final[: len(second)]):
        if j not in pairs.values():
            fe.notes.append(f"Only {b_name} found this event.")
    return final


# Notes a tie-breaker can settle: where the two readings put an event, and whether it exists.
DISAGREEMENT_NOTE = re.compile(r"^(\w+ said .*; using \w+'s\.|Only \w+ found this event.*)$")
FOOD_DISPUTE_NOTE = re.compile(r"^\w+ found free food .*; \w+ found none\. Check the post\.$")


def settleable(fe) -> bool:
    return any(DISAGREEMENT_NOTE.match(n) or FOOD_DISPUTE_NOTE.match(n) for n in fe.notes)


def settle(events: list, third: list) -> int:
    """Drops the notes a third reading settles; returns how many events it settled.

    Works on anything with .event (name, start, start_time_known, location) and
    .notes, so saved rows can be settled the same way as fresh readings.
    """
    settled = 0
    for fe in events:
        if not settleable(fe):
            continue
        other = closest(third, fe.event)
        if other is None or when(other) != when(fe.event) or not same_place(other.location, fe.event.location):
            continue
        kept = [
            n for n in fe.notes
            if not DISAGREEMENT_NOTE.match(n) and not (FOOD_DISPUTE_NOTE.match(n) and other.has_free_food)
        ]
        if len(kept) < len(fe.notes):
            fe.notes[:] = kept
            settled += 1
    return settled


def closest(events: list, e):
    """The event in another reading that's this one: a similar name, preferring the same day and start.

    Preferring the same start keeps a club's two shows on one day (a matinee and
    an evening) from being compared with each other.
    """
    def similarity(x) -> float:
        return SequenceMatcher(None, x.event_name.lower(), e.event_name.lower()).ratio()

    def same_day(x) -> bool:
        return local_date(x.start) == local_date(e.start)

    candidates = [x for x in events if (same_day(x) and similarity(x) >= 0.3) or similarity(x) >= 0.75]
    return max(candidates, key=lambda x: (same_day(x) and when(x) == when(e), same_day(x), similarity(x)), default=None)


# Words that say nothing about which place it is.
GENERIC_PLACE_WORDS = {
    "the", "a", "at", "in", "of", "on", "and", "via", "front", "room", "rm", "hall", "building",
    "centre", "center", "library", "lounge", "mcmaster", "university", "campus",
}


def same_place(a: str | None, b: str | None) -> bool:
    """Whether two readings of a location can be the same place, however they're worded.

    Room numbers decide when both have them: "KTH Bio3" and "KTH B103" differ,
    "HH 305" and "Hamilton Hall 305" agree, and one reading may add numbers the
    other left out. Otherwise one shared distinctive word is enough ("Blue
    Lounge" and "The Blue Lounge (The Hub)"). A missing location never disagrees.
    """
    if not a or not b:
        return True
    words_a, words_b = (set(re.findall(r"[a-z0-9]+", s.lower())) for s in (a, b))
    if words_a == words_b:
        return True
    numbers_a, numbers_b = ({w for w in words if any(c.isdigit() for c in w)} for words in (words_a, words_b))
    if numbers_a and numbers_b:
        return numbers_a <= numbers_b or numbers_b <= numbers_a
    distinct_a, distinct_b = words_a - GENERIC_PLACE_WORDS, words_b - GENERIC_PLACE_WORDS
    # "McMaster University Campus" names no particular place, so it can't disagree with one.
    if not distinct_a or not distinct_b:
        return True
    return bool(distinct_a & distinct_b)


def room_key(location: str | None) -> str:
    """The place as written, minus the expansion: "ETB 124 (Engineering Technology Building)" -> "etb124".

    Whole locations differ in wording too often to compare, and two rooms whose
    expansions both say "Engineering Building" would look alike.
    """
    return re.sub(r"[^a-z0-9]", "", re.split(r"[(,]", (location or "").lower())[0])


def match(first: list[ExtractedEvent], second: list[ExtractedEvent]) -> dict[int, int]:
    """Pair events across passes: same date with a similar name, or a near-identical name."""
    pairs: dict[int, int] = {}
    for i, a in enumerate(first):
        best, best_score = None, 0.0
        for j, b in enumerate(second):
            if j in pairs.values():
                continue
            similarity = SequenceMatcher(None, a.event_name.lower(), b.event_name.lower()).ratio()
            same_day = local_date(a.start) == local_date(b.start)
            if (same_day and similarity >= 0.3) or similarity >= 0.75:
                score = similarity + same_day
                if score > best_score:
                    best, best_score = j, score
        if best is not None:
            pairs[i] = best
    return pairs


def local_date(dt: datetime | None) -> date | None:
    if dt is None:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=LOCAL_TZ)).astimezone(LOCAL_TZ).date()


def when(e: ExtractedEvent) -> str:
    if e.start is None:
        return "no date"
    start = (e.start if e.start.tzinfo else e.start.replace(tzinfo=LOCAL_TZ)).astimezone(LOCAL_TZ)
    return f"{start:%a %b} {start.day}" + (f" {start:%H:%M}" if e.start_time_known else ", time unknown")


def short_name(model: str) -> str:
    """claude-haiku-4-5 -> Haiku, gemini-3.8-flash -> Gemini."""
    parts = model.split("-")
    return parts[1].capitalize() if parts[0] == "claude" and len(parts) > 1 else parts[0].capitalize()
