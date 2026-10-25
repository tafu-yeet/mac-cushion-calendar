"""Combines Rubric events with Instagram events, so each event gets the most
trustworthy value for each field.

Matching: a Rubric event and an Instagram event are taken to be the same when
they're from the same club (through rubric_societies; a co-host counts too), on
the same day, starting within an hour of each other. Each pair is scored from
the club link, how close the times are and how alike the names are (a weak
sign: "MDA Crafting Night" is "Clay It Your Way"). A link to the Rubric event
in the Instagram club's bio or Linktree (bio_links.py) counts as a club link
and adds BIO_BONUS. At AUTO and up they merge;
from REVIEW up a person decides (event_matches); below, they're separate events.

Which source wins, field by field:
- date, start and end, place, price, ticket link: Rubric, which is structured
  and official. Except when the Instagram post came after we last saw the
  Rubric record change and says something moved ("moved to", "new time",
  "postponed", "cancelled"): then Instagram's value stays and it's flagged.
- free food: Instagram, but either source saying there's free food is enough
  (Rubric's description is checked for food words); food_source records which.
- description and image: the Instagram post's, with Rubric's kept as a fallback.
- sign-up or ticket needed: true if either says so.
A field a person set (events.reviewed_fields) is never overwritten. A real
disagreement (start or end more than 15 minutes apart, different rooms, a
different price) changes nothing: both values go to events.conflicts for a
person. Small differences take Rubric's value.

A Rubric event that matches nothing becomes an event of its own (no post) and
is published straight away, unless: it may be a duplicate (a similar name the
same day from any club, the same club within a few hours, an undecided possible
match, or one a person rejected); or its club isn't on our list, or the link to
it is unconfirmed; or it has started or left Rubric. Then it waits, the reason
in its review notes. A person's approval or rejection always stands. A deleted
Instagram post doesn't cancel an event, and neither does an event dropping off
Rubric: both are flagged, never deleted.

Matching from scratch each run gives the same answer, so running it again only
writes what changed.

Usage (from worker/):
    python merge.py                                   report on the next 6 weeks; changes nothing
    python merge.py --from 2026-10-19 --to 2026-10-25 a date range, inclusive
    python merge.py --apply                           save the merge
"""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from supabase import Client

import bio_links
from auto_approve import name_similarity, similar_names, word_overlap
from clean import clean_place
from extractors.two_stage import GENERIC_PLACE_WORDS, same_place
from rubric import acronyms, aliases_for, fetch_all
from settings import CAMPUS, LOCAL_TZ

AUTO, REVIEW = 0.75, 0.5
BIO_BONUS = 0.15         # the Instagram club's bio links the Rubric event
MAX_START_GAP_MIN = 60   # starts further apart than this are different events
CONFLICT_MIN = 15        # times further apart than this need a person
RUBRIC_ONLY_CONFIDENCE = 0.85
BOTH_CONFIDENCE = 0.95
RUBRIC_FIELDS = ("starts_at", "ends_at", "location", "cost", "price", "ticket_url")

CATEGORIES = {
    "Party/BBQ/Social": "social", "Quiz/Trivia": "social", "Ball/Dinner/Gala": "social",
    "Sport/Competition": "sports", "Show/Performance": "arts",
    "Class/Workshop": "learn", "Industry/Career": "learn", "Other": "other",
}
FOOD_WORDS = re.compile(r"\b(pizza|snacks?|food|refreshments?|coffee|treats?|catered|catering)\b", re.I)
NOT_FREE = re.compile(r"\b(sale|selling|for sale|buy|purchase|fundraiser|fundraising|food drive|food bank)\b|\$\s?\d", re.I)
SAYS_FREE = re.compile(r"\bfree\b[^.!\n]{0,40}\b(pizza|snacks?|food|refreshments?|coffee|treats?)\b", re.I)
SIGNUP = re.compile(
    r"\b(limited (spots|spaces?|seats|capacity|tickets)|spots? (are )?limited|sign[ -]?up|registration (is )?(required|needed)"
    r"|register (by|at|here|now|through|using|before)|tickets? (are )?required|rsvp (is )?required)\b",
    re.I,
)
STATED_LIMIT = re.compile(
    r"\b(members?|sisters?|brothers?|girls?|women|ladies|men|guys)[ -]only\b|\bonly (for|open to)\b|\bexclusive(ly)? (to|for)\b",
    re.I,
)
CHANGE = re.compile(
    r"\b(moved to|new (time|location|room|date|venue)|postponed|cancell?ed|rescheduled|change of (venue|location|time|room|date))\b",
    re.I,
)
RUBRIC_CANCELLED = re.compile(r"\b(cancell?ed|postponed|no longer happening)\b", re.I)
RUBRIC_SAYS_OFF = re.compile(r"\b(event|it) (has been|is|was|will be) (cancell?ed|postponed)\b|\bno longer happening\b", re.I)
# The flags the merge sets and clears itself; others (a recheck's, visitors' reports) it leaves alone.
MERGE_FLAGS = {"instagram_post_deleted", "rubric_missing", "changed_on_instagram", "rubric_cancelled"}


def merged_flags(current: list[str] | None, mine: set[str], reviewed: list[str] | None) -> list[str]:
    """An event's flags after a merge: its other flags kept, the merge's own replaced,
    minus any a person dismissed for this event ("flag:<name>" in reviewed_fields)."""
    dismissed = {f.removeprefix("flag:") for f in reviewed or [] if f.startswith("flag:")}
    return sorted((set(current or []) - MERGE_FLAGS) | (mine - dismissed))


def rubric_says_cancelled(r: dict) -> bool:
    """Rubric has no cancelled status: clubs retitle the listing ("CANCELLED - Movie Night") or say so in it."""
    if RUBRIC_CANCELLED.search(r.get("title") or ""):
        return True
    text = r.get("description") or ""
    # "If the event is cancelled due to weather..." is a plan, not news.
    return any(not re.search(r"\b(if|in case|should|whether)\b", text[max(0, m.start() - 25):m.start()], re.I)
               for m in RUBRIC_SAYS_OFF.finditer(text))


# Loading -------------------------------------------------------------------------

@dataclass
class Society:
    society_id: int
    name: str
    aliases: list[str]
    clubs: dict[int, float]  # our club id -> how sure the link is (1 confirmed, 0.6 to review)
    status: str


def load_societies(sb: Client) -> dict[int, Society]:
    rows = fetch_all(lambda a, b: sb.table("rubric_societies").select(
        "society_id, name, aliases, club_id, extra_club_ids, match_status").range(a, b))
    out = {}
    for r in rows:
        weight = {"confirmed": 1.0, "review": 0.6}.get(r["match_status"], 0.0)
        clubs = {}
        if r["club_id"] and weight:
            clubs[r["club_id"]] = weight
        for extra in r["extra_club_ids"] or []:
            clubs[extra] = 1.0
        out[r["society_id"]] = Society(r["society_id"], r["name"], r["aliases"] or [], clubs, r["match_status"])
    return out


def local_day(iso: str) -> date:
    return datetime.fromisoformat(iso).astimezone(LOCAL_TZ).date()


def day_bounds(start: date, end: date) -> tuple[str, str]:
    lo = datetime.combine(start, datetime.min.time(), LOCAL_TZ)
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time(), LOCAL_TZ)
    return lo.astimezone(timezone.utc).isoformat(), hi.astimezone(timezone.utc).isoformat()


EVENT_COLUMNS = (
    "id, status, name, club_id, hosted_by, starts_at, ends_at, start_time_known, location, has_free_food, "
    "food_description, cost, price, open_to_all, confidence, reviewed_fields, reviewed_by, conflicts, flags, "
    "rubric_eid, source, signup_required, food_source, ticket_url, image_url, description, post_id, review_notes, "
    "category, event_type, reason, auto_approved, "
    "posts(posted_at, caption, deleted_at, permalink), clubs(instagram_username, name, links)"
)


# Scoring -------------------------------------------------------------------------

def minutes_apart(a: str, b: str) -> float:
    return abs((datetime.fromisoformat(a) - datetime.fromisoformat(b)).total_seconds()) / 60


def club_link(r: dict, e: dict, societies: dict[int, Society]) -> tuple[float, str]:
    """How surely the Instagram event's club is the Rubric event's club, or one of its co-hosts."""
    own = societies.get(r["society_id"])
    if own and e["club_id"] in own.clubs:
        return own.clubs[e["club_id"]], "same club" if own.clubs[e["club_id"]] == 1.0 else "same club (link unconfirmed)"
    for cid in r["collaborator_ids"] or []:
        co = societies.get(cid)
        if co and e["club_id"] in co.clubs:
            return 0.8 * co.clubs[e["club_id"]], f"co-host {co.name}"
    # The Instagram event names its host: "Nature@Mac", a Rubric club's name or short name.
    host = (e.get("hosted_by") or "").strip()
    if host and own:
        names = [own.name, *own.aliases]
        if any(name_similarity(host, n) >= 0.8 or word_overlap(host, n) >= 0.8 for n in names):
            return 0.8, f"hosted by {host}"
    return 0.0, ""


def strip_club_words(title: str, society: Society | None) -> str:
    """"MDA Crafting Night" -> "Crafting Night": a club's own short name says nothing about the event."""
    if not society:
        return title
    short = {a.lower() for a in [*society.aliases, *acronyms(society.name)] if len(a) <= 8}
    return " ".join(w for w in title.split() if re.sub(r"[^a-z0-9]", "", w.lower()) not in short) or title


def score_pair(r: dict, e: dict, societies: dict[int, Society]) -> tuple[float, dict] | None:
    """The match score and its reasons, or None when they can't be the same event."""
    if local_day(r["starts_at"]) != local_day(e["starts_at"]):
        return None
    club, club_why = club_link(r, e, societies)
    # The Instagram club's own bio (or Linktree) links this Rubric event: strong evidence.
    linked = r["eid"] in bio_links.rubric_ids((e.get("clubs") or {}).get("links") or [], bio_links.RUBRIC_EVENT)
    if linked:
        club, club_why = 1.0, "the club's bio links this Rubric event"
    if not club:
        return None
    if e["start_time_known"]:
        gap = minutes_apart(r["starts_at"], e["starts_at"])
        if gap > MAX_START_GAP_MIN:
            return None
        timing = 1.0 if gap == 0 else 0.9 if gap <= CONFLICT_MIN else 0.75 if gap <= 30 else 0.6
        time_why = "same start" if gap == 0 else f"starts {gap:.0f} min apart"
    else:
        timing, time_why = 0.5, "Instagram gives no start time"
    society = societies.get(r["society_id"])
    a, b = strip_club_words(r["title"], society), strip_club_words(e["name"], society)
    title = max(name_similarity(a, b), word_overlap(a, b))
    place = 0.0
    if r["location"] and e["location"]:
        place = 0.05 if same_place(expand_codes(r["location"]), expand_codes(e["location"])) else -0.1
    score = max(0.0, min(1.0, 0.45 * club + 0.35 * timing + 0.20 * title + place + (BIO_BONUS if linked else 0)))
    return round(score, 3), {"club": club_why, "time": time_why, "title": round(title, 2), "place": place}


CODES = {code.lower(): full for code, full in CAMPUS["campusLocations"].items()}


def expand_codes(location: str) -> str:
    """"MUSC 230" -> "MUSC 230 McMaster University Student Centre", so codes and full names compare;
    accents and apostrophes go, so "Bridges Café" and "Bridge's Cafe" are one place."""
    folded = unicodedata.normalize("NFKD", location).encode("ascii", "ignore").decode()
    folded = re.sub(r"['’]", "", folded)
    words = re.findall(r"[A-Za-z]+", folded)
    extra = [CODES[w.lower()] for w in words if w.lower() in CODES]
    return " ".join([folded, *extra])


def place_words(location: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", expand_codes(location).lower())) - GENERIC_PLACE_WORDS


# Field precedence ------------------------------------------------------------------

def rubric_cost(r: dict) -> tuple[str, str | None]:
    """("free", None) or ("paid", "$5–$10") from Rubric's listing and ticket types."""
    info = (r["price_info"] or "").strip()
    amounts = sorted({t["amount"] for t in r["tickets"] or [] if t["amount"] > 0})
    if info.lower() == "free" and not amounts:
        return "free", None
    listed = [float(x) for x in re.findall(r"\$\s?(\d+(?:\.\d+)?)", info)] or amounts
    if not listed:
        return ("free", None) if info.lower() == "free" else ("unknown", None)
    money = [f"${x:.2f}".replace(".00", "") for x in (min(listed), max(listed))]
    return "paid", money[0] if money[0] == money[1] else f"{money[0]}–{money[1]}"


def amounts(text: str | None) -> list[float]:
    return [float(x) for x in re.findall(r"\$\s?(\d+(?:\.\d+)?)", text or "")]


def price_differs(rubric_price: str | None, ig_price: str | None) -> bool:
    """Whether two prices really disagree; Rubric's include ticket fees, so a few cents' or a dollar's gap doesn't count."""
    a, b = amounts(rubric_price), amounts(ig_price)
    if not a or not b:
        return False
    return not any(abs(x - y) <= max(1.5, 0.2 * max(x, y)) for x in a for y in b)


def rubric_food(r: dict) -> str | None:
    """The free food Rubric's description mentions, or None. Food at a paid event, or for sale, isn't free."""
    text = " ".join(filter(None, [r["title"], r["description"]]))
    words = list(dict.fromkeys(m.lower() for m in FOOD_WORDS.findall(text)))
    if not words:
        return None
    cost, _ = rubric_cost(r)
    if (cost == "paid" or NOT_FREE.search(text)) and not SAYS_FREE.search(text):
        return None
    return " and ".join(w for w in words[:2] if w != "food") or "free food"


def more_specific(ig: str, rubric: str) -> bool:
    """Instagram's place adds a room number Rubric's doesn't have: "MUSC 230" vs "MUSC"."""
    numbers = lambda s: {w for w in re.findall(r"[a-z]*\d+[a-z]*", s.lower())}
    return bool(numbers(ig) - numbers(rubric))


@dataclass
class Change:
    event_id: int | None
    eid: int
    update: dict = field(default_factory=dict)
    conflicts: dict = field(default_factory=dict)
    flags: set = field(default_factory=set)


def merge_fields(r: dict, e: dict) -> Change:
    """What merging the Rubric event into the Instagram event changes, and what it can't decide."""
    ch = Change(e["id"], r["eid"])
    post = e.get("posts") or {}
    caption = post.get("caption") or ""
    reviewed = set(e["reviewed_fields"] or [])
    newer_change = bool(post.get("posted_at")) and post["posted_at"] > r["changed_at"] and bool(CHANGE.search(caption))
    cost, price = rubric_cost(r)
    rubric = {
        "starts_at": r["starts_at"], "ends_at": r["ends_at"], "location": r["location"],
        "cost": cost if cost != "unknown" else None, "price": price, "ticket_url": r["url"],
    }

    for f in RUBRIC_FIELDS:
        rv, iv = rubric[f], e[f]
        if rv is None or rv == iv or f in reviewed:
            continue
        if f in ("starts_at", "ends_at"):
            same = iv is not None and minutes_apart(rv, iv) == 0
            if same:
                continue
            real = iv is not None and (f == "ends_at" or e["start_time_known"]) and minutes_apart(rv, iv) > CONFLICT_MIN
        elif f == "location":
            if iv and same_place(expand_codes(iv), expand_codes(rv)):
                # The same place: keep Instagram's when it names a room Rubric's doesn't,
                # or when Rubric's adds nothing to it ("JHE A102, John Hodgins..." again).
                if more_specific(iv, rv) or place_words(rv) <= place_words(iv):
                    continue
            real = bool(iv) and not same_place(expand_codes(iv), expand_codes(rv))
        elif f == "cost":
            real = iv in ("free", "paid") and iv != rv
        elif f == "price":
            if price_differs(rv, iv):
                real = True
            elif iv and amounts(iv):
                continue  # the same price, worded differently (or before Rubric's fees)
            else:
                real = False
        else:
            real = False
        if newer_change and f in ("starts_at", "ends_at", "location") and iv:
            ch.flags.add("changed_on_instagram")
            ch.conflicts[f] = {"rubric": rv, "instagram": iv, "why": "the newer Instagram post says it changed"}
        elif real:
            ch.conflicts[f] = {"rubric": rv, "instagram": iv}
        else:
            ch.update[f] = rv
            if f == "starts_at":
                ch.update["start_time_known"] = True

    food = rubric_food(r)
    if e["has_free_food"] and food:
        source = "both"
    elif e["has_free_food"]:
        source = "instagram"
    elif food:
        source = "rubric"
        if "has_free_food" in reviewed:
            ch.conflicts["has_free_food"] = {"rubric": True, "instagram": False, "why": f"Rubric mentions {food}"}
            source = None
        else:
            ch.update |= {"has_free_food": True, "food_description": e["food_description"] or food}
    else:
        source = None
    if source != e["food_source"]:
        ch.update["food_source"] = source

    signup = bool(e["signup_required"]) or bool(SIGNUP.search(caption)) or rubric_signup(r)
    extra = {
        "signup_required": signup, "image_url": r["image_url"], "description": r["description"],
        "source": "both", "rubric_eid": r["eid"], "confidence": max(e["confidence"] or 0, BOTH_CONFIDENCE),
    }
    ch.update |= {k: v for k, v in extra.items() if e.get(k) != v and k not in reviewed}

    if post.get("deleted_at"):
        ch.flags.add("instagram_post_deleted")
    if r["missing_since"]:
        ch.flags.add("rubric_missing")
    if rubric_says_cancelled(r):
        ch.flags.add("rubric_cancelled")
    return ch


def rubric_signup(r: dict) -> bool:
    return any(t["amount"] > 0 for t in r["tickets"] or []) or bool(SIGNUP.search(r["description"] or ""))


def rubric_off_campus(r: dict) -> bool:
    """Away from campus, judged from Rubric's address: on campus when it names McMaster,
    the campus address, a campus building, or somewhere online."""
    place = (r.get("address") or r.get("location") or "").lower()
    if not place.strip():
        return False
    if "mcmaster" in place or "1280 main" in place or re.search(r"\b(online|zoom|virtual|teams)\b", place):
        return False
    return not any(re.search(rf"\b{re.escape(code)}\b", place) for code in CODES)


def rubric_only_row(r: dict, club_id: int, society: Society) -> dict:
    """An events row for a Rubric event with no Instagram post."""
    cost, price = rubric_cost(r)
    food = rubric_food(r)
    tickets = r["tickets"] or []
    # Limited only when Rubric says so (extractors.base.OPEN_TO_ALL_RULE): member-only tickets,
    # or "members only", "sisters only", "only for grad students" in the listing.
    members_only = bool(tickets) and all(re.search(r"\bmember", t["name"] or "", re.I) for t in tickets)
    stated_limit = bool(STATED_LIMIT.search(" ".join(filter(None, [r["title"], r["description"]]))))
    notes = [] if society.status == "confirmed" else [
        f"Club link unconfirmed: Rubric's “{society.name}” may not be this club."]
    return {
        "club_id": club_id, "post_id": None, "source": "rubric", "rubric_eid": r["eid"],
        "name": r["title"], "event_type": (r["category"] or "other").lower(),
        "category": CATEGORIES.get(r["category"] or "", "other"),
        "starts_at": r["starts_at"], "ends_at": r["ends_at"], "start_time_known": True,
        "location": clean_place(r["location"]), "off_campus": rubric_off_campus(r), "cost": cost, "price": price,
        "ticket_url": r["url"],
        "image_url": r["image_url"], "description": r["description"],
        "has_free_food": bool(food), "food_description": food, "food_source": "rubric" if food else None,
        "signup_required": rubric_signup(r), "open_to_all": not (members_only or stated_limit),
        "confidence": RUBRIC_ONLY_CONFIDENCE, "reason": "Listed on Rubric.", "review_notes": notes,
        "model": "rubric", "extracted": {"source": "rubric", "eid": r["eid"]},
        "flags": [f for f, on in (("rubric_cancelled", rubric_says_cancelled(r)), ("rubric_missing", bool(r["missing_since"]))) if on],
    }


DUPLICATE_WINDOW_MIN = 180  # the same club's events this close on one day may be one event


def rubric_duplicate(r: dict, events: list[dict], society: Society | None, match_waiting: bool) -> str | None:
    """Why a Rubric event that matched nothing may still be an event we list, or None.

    Checked before publishing it on its own: a similar name the same day from any
    club (a hub's repost, a co-host's post), the same club the same day within a
    few hours (Instagram may have the time wrong), or a possible match that a
    person hasn't decided yet.
    """
    if match_waiting:
        return "possible match with an Instagram event waiting for a person"
    day, own = local_day(r["starts_at"]), set(society.clubs) if society else set()
    title = strip_club_words(r["title"], society)
    for e in events:
        if not e["starts_at"] or local_day(e["starts_at"]) != day:
            continue
        same_club = e["club_id"] in own
        close = not e["start_time_known"] or minutes_apart(r["starts_at"], e["starts_at"]) <= DUPLICATE_WINDOW_MIN
        if similar_names(title, strip_club_words(e["name"], society)) or (same_club and close):
            who = (e.get("clubs") or {}).get("instagram_username", "?")
            if e["status"] == "rejected":
                return f"looks like #{e['id']} “{e['name']}” (@{who}), which a person rejected"
            return f"may be the same as #{e['id']} “{e['name']}” (@{who})"
    return None


# Planning --------------------------------------------------------------------------

@dataclass
class Plan:
    start: date
    end: date
    rubric: dict[int, dict]
    events: dict[int, dict]
    societies: dict[int, Society]
    merged: list[tuple[dict, dict, float, dict, Change]] = field(default_factory=list)
    review: list[tuple[dict, dict, float, dict]] = field(default_factory=list)
    # (rubric, club_id, existing row, why it can't be published or None)
    rubric_only: list[tuple[dict, int | None, dict | None, str | None]] = field(default_factory=list)
    instagram_only: list[dict] = field(default_factory=list)
    copies: list[tuple[dict, dict, float]] = field(default_factory=list)
    flags: dict[int, set] = field(default_factory=dict)  # event id -> flags for unmatched events


def plan(sb: Client, start: date, end: date) -> Plan:
    lo, hi = day_bounds(start, end)
    rubric = {r["eid"]: r for r in fetch_all(lambda a, b: sb.table("rubric_events").select(
        "eid, society_id, title, category, price_info, starts_at, ends_at, location, address, description, tickets, "
        "collaborator_ids, image_url, url, changed_at, missing_since").gte("starts_at", lo).lt("starts_at", hi).range(a, b))}
    events = {e["id"]: e for e in fetch_all(lambda a, b: sb.table("events").select(EVENT_COLUMNS)
        .in_("status", ["pending", "approved"]).gte("starts_at", lo).lt("starts_at", hi).range(a, b))}
    societies = load_societies(sb)
    decided = {
        (m["rubric_eid"], m["event_id"]): m["status"]
        for m in sb.table("event_matches").select("rubric_eid, event_id, status").neq("status", "review").execute().data
    }
    p = Plan(start, end, rubric, events, societies)

    instagram = [e for e in events.values() if e["source"] != "rubric"]
    # Every status: a Rubric-only event a person rejected must stay rejected, not come back.
    rubric_rows = {
        e["rubric_eid"]: e for e in fetch_all(lambda a, b: sb.table("events").select(EVENT_COLUMNS)
            .eq("source", "rubric").gte("starts_at", lo).lt("starts_at", hi).range(a, b))
    }
    waiting = {m["rubric_eid"] for m in sb.table("event_matches").select("rubric_eid").eq("status", "review").execute().data}
    # Events a person rejected: a Rubric listing of the same event mustn't publish around them.
    rejected = fetch_all(lambda a, b: sb.table("events").select(EVENT_COLUMNS).eq("status", "rejected")
        .not_.is_("reviewed_by", "null").gte("starts_at", lo).lt("starts_at", hi).range(a, b))
    pairs = []
    for r in rubric.values():
        for e in instagram:
            if decided.get((r["eid"], e["id"])) == "separate":
                continue
            if e["rubric_eid"] and e["rubric_eid"] != r["eid"]:
                continue  # already merged with another Rubric event
            forced = e["rubric_eid"] == r["eid"] or decided.get((r["eid"], e["id"])) == "merged"
            scored = score_pair(r, e, societies)
            if forced:
                pairs.append((1.0, r, e, (scored or (0, {}))[1] | {"decided": "merged before or by a person"}))
            elif scored:
                pairs.append((scored[0], r, e, scored[1]))

    # Best pairs first, each event used once; a second Instagram event that fits as
    # well is a copy (a hub's repost, a collab), not a different event.
    used_r, used_e = set(), set()
    for score, r, e, why in sorted(pairs, key=lambda x: -x[0]):
        if score < REVIEW:
            continue
        if r["eid"] in used_r or e["id"] in used_e:
            if r["eid"] in used_r and e["id"] not in used_e and score >= AUTO:
                p.copies.append((r, e, score))
                used_e.add(e["id"])
            continue
        if score >= AUTO:
            p.merged.append((r, e, score, why, merge_fields(r, e)))
        else:
            p.review.append((r, e, score, why))
        used_r.add(r["eid"])
        used_e.add(e["id"])

    for r in rubric.values():
        if r["eid"] in used_r:
            continue
        # Only a confirmed club link files a Rubric-only event under one of our clubs;
        # an unconfirmed one waits for a person on the Clubs page.
        society = societies.get(r["society_id"])
        confirmed = [cid for cid, w in (society.clubs if society else {}).items() if w == 1.0]
        club_id = confirmed[0] if confirmed else None
        others = [e for e in [*events.values(), *rejected] if e.get("rubric_eid") != r["eid"]]
        hold = rubric_duplicate(r, others, society, r["eid"] in waiting)
        if not hold:
            if not society or not society.clubs:
                hold = "club not on our list"
            elif not club_id:
                hold = "club link to confirm (admin Clubs page)"
            elif r["missing_since"]:
                hold = "no longer listed on Rubric"
            elif datetime.fromisoformat(r["starts_at"]) <= datetime.now(timezone.utc):
                hold = "already started"
        p.rubric_only.append((r, club_id, rubric_rows.get(r["eid"]), hold))

    for e in instagram:
        if e["id"] in used_e:
            continue
        p.instagram_only.append(e)
        if (e.get("posts") or {}).get("deleted_at"):
            p.flags[e["id"]] = {"instagram_post_deleted"}
    return p


# Saving ------------------------------------------------------------------------------

def apply(sb: Client, p: Plan) -> dict[str, int]:
    """Save a plan. Only what differs from what's stored is written."""
    done = {"merged": 0, "added": 0, "updated": 0, "to_review": 0, "flagged": 0}
    for r, e, score, why, ch in p.merged:
        update = dict(ch.update)
        flags = merged_flags(e["flags"], ch.flags, e["reviewed_fields"])
        if flags != sorted(e["flags"] or []):
            update["flags"] = flags
        if ch.conflicts != (e["conflicts"] or {}):
            update["conflicts"] = ch.conflicts
        # A Rubric-only row added on an earlier run gives way to the Instagram event it turned out to be.
        old = sb.table("events").select("id, reviewed_by").eq("rubric_eid", r["eid"]).neq("id", e["id"]).execute().data
        if old and not old[0]["reviewed_by"]:
            sb.table("events").delete().eq("id", old[0]["id"]).execute()
        elif old:
            sb.table("event_matches").upsert({"rubric_eid": r["eid"], "event_id": e["id"], "score": score, "reasons": why,
                                              "status": "review"}, on_conflict="rubric_eid,event_id").execute()
            done["to_review"] += 1
            continue
        if update:
            sb.table("events").update(update).eq("id", e["id"]).execute()
            done["merged"] += 1
        sb.table("event_matches").upsert({"rubric_eid": r["eid"], "event_id": e["id"], "score": score, "reasons": why,
                                          "status": "merged"}, on_conflict="rubric_eid,event_id").execute()
    for r, e, score, why in p.review:
        sb.table("event_matches").upsert({"rubric_eid": r["eid"], "event_id": e["id"], "score": score, "reasons": why,
                                          "status": "review"}, on_conflict="rubric_eid,event_id").execute()
        done["to_review"] += 1
    now = datetime.now(timezone.utc).isoformat()
    for r, club_id, existing, hold in p.rubric_only:
        if club_id is None:
            continue  # not one of our clubs (yet): nothing to file it under
        row = rubric_only_row(r, club_id, p.societies[r["society_id"]])
        if hold:
            row["review_notes"] = [*row["review_notes"], f"Not published automatically: {hold}."]
        # Published straight away when nothing holds it back: Rubric is the MSU's own listing.
        status = {"status": "pending" if hold else "approved", "auto_approved": not hold,
                  "reviewed_at": None if hold else now}
        if existing is None:
            sb.table("events").insert(row | status).execute()
            done["published" if not hold else "added"] = done.get("published" if not hold else "added", 0) + 1
            continue
        reviewed = set(existing["reviewed_fields"] or [])
        row["flags"] = merged_flags(existing["flags"], set(row["flags"]), existing["reviewed_fields"])
        # Who can come, and whether it's off campus, are decided once, on adding (a person may change them).
        update = {k: v for k, v in row.items()
                  if k not in reviewed and k not in ("open_to_all", "off_campus") and existing.get(k) != v and k in existing}
        # A person's approval or rejection stands; the worker only moves what it decided itself.
        if not existing["reviewed_by"] and existing["status"] != "rejected" and existing["status"] != status["status"]:
            update |= status
            done["published" if not hold else "unpublished"] = done.get("published" if not hold else "unpublished", 0) + 1
        if update:
            sb.table("events").update(update).eq("id", existing["id"]).execute()
            done["updated"] += 1
    for event_id, flags in p.flags.items():
        e = p.events[event_id]
        new = sorted(set(e["flags"] or []) | set(merged_flags([], flags, e["reviewed_fields"])))
        if new != sorted(e["flags"] or []):
            sb.table("events").update({"flags": new}).eq("id", event_id).execute()
            done["flagged"] += 1
    return done


# Report ------------------------------------------------------------------------------

def when(iso: str | None, known: bool = True) -> str:
    if not iso:
        return "-"
    t = datetime.fromisoformat(iso).astimezone(LOCAL_TZ)
    return f"{t:%a %b} {t.day} " + (f"{t:%H:%M}" if known else "(no time)")


def show(field_name: str, value) -> str:
    if field_name in ("starts_at", "ends_at"):
        return when(value)
    return "-" if value in (None, "") else str(value)


def report(p: Plan) -> str:
    lines = []
    out = lines.append
    conflicts = [(r, e, f, v) for r, e, _, _, ch in p.merged for f, v in ch.conflicts.items()]
    mapped = [x for x in p.rubric_only if x[1]]
    out(f"Rubric + Instagram, {p.start:%b %d} to {p.end:%b %d}")
    out(f"  Rubric events: {len(p.rubric)} | Instagram events (pending or published): "
        f"{sum(e['source'] != 'rubric' for e in p.events.values())}")
    out(f"  matched (both sources): {len(p.merged)}")
    out(f"  possible matches for a person: {len(p.review)}")
    publish = sum(1 for x in p.rubric_only if not x[3])
    out(f"  Rubric only: {len(p.rubric_only)} ({publish} to publish, {len(p.rubric_only) - publish} held; "
        f"{len(p.rubric_only) - len(mapped)} from clubs not on our list or not confirmed)")
    out(f"  Instagram only: {len(p.instagram_only)}  (+{len(p.copies)} copies of matched events)")
    out(f"  conflicts: {len(conflicts)} field(s) on {len({e['id'] for _, e, _, _ in conflicts})} event(s)")

    out("\nMATCHED")
    for r, e, score, why, ch in sorted(p.merged, key=lambda x: x[0]["starts_at"]):
        out(f"  {score:.2f}  {when(r['starts_at'])}  Rubric “{r['title']}” = #{e['id']} “{e['name']}” "
            f"(@{e['clubs']['instagram_username']}) [{why.get('club')}; {why.get('time')}; title {why.get('title')}]")
        changes = {k: v for k, v in ch.update.items() if k in RUBRIC_FIELDS + ("has_free_food", "food_description")}
        for k, v in changes.items():
            out(f"          {k}: {show(k, e[k])} -> {show(k, v)}")
        for k, v in ch.conflicts.items():
            out(f"          CONFLICT {k}: Rubric {show(k, v['rubric'])} | Instagram {show(k, v['instagram'])}"
                + (f" ({v['why']})" if v.get("why") else ""))
        if ch.flags:
            out(f"          flags: {', '.join(sorted(ch.flags))}")
    for r, e, score in p.copies:
        out(f"  copy  #{e['id']} “{e['name']}” (@{e['clubs']['instagram_username']}) is the same as Rubric “{r['title']}”")

    out("\nCONFLICTS (both values, for a person)")
    for r, e, f, v in conflicts:
        out(f"  #{e['id']} “{e['name']}” {f}: Rubric {show(f, v['rubric'])}  |  Instagram {show(f, v['instagram'])}"
            + (f"  ({v['why']})" if v.get("why") else ""))
    if not conflicts:
        out("  none")

    out("\nPOSSIBLE MATCHES (a person decides)")
    for r, e, score, why in p.review:
        out(f"  {score:.2f}  Rubric “{r['title']}” {when(r['starts_at'])} ? #{e['id']} “{e['name']}” "
            f"{when(e['starts_at'], e['start_time_known'])} [{why.get('club')}; {why.get('time')}; title {why.get('title')}]")
    if not p.review:
        out("  none")

    out("\nRUBRIC ONLY")
    for r, club_id, existing, hold in sorted(p.rubric_only, key=lambda x: x[0]["starts_at"]):
        society = p.societies.get(r["society_id"])
        person = existing and existing["reviewed_by"]
        verdict = f"you {existing['status']} it" if person else ("PUBLISH" if not hold else f"hold: {hold}")
        out(f"  {when(r['starts_at'])}  “{r['title']}” - {society.name if society else r['society_id']} "
            f"{rubric_cost(r)[1] or rubric_cost(r)[0]}" + (f"  food: {rubric_food(r)}" if rubric_food(r) else "")
            + f"  -> {verdict}")

    out("\nINSTAGRAM ONLY")
    for e in sorted(p.instagram_only, key=lambda e: e["starts_at"]):
        flag = "  [post deleted: kept, flagged]" if e["id"] in p.flags else ""
        out(f"  {when(e['starts_at'], e['start_time_known'])}  #{e['id']} “{e['name']}” "
            f"(@{e['clubs']['instagram_username']}, {e['status']}){flag}")
    return "\n".join(lines)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Merge Rubric events with Instagram events.")
    today = datetime.now(LOCAL_TZ).date()
    parser.add_argument("--from", dest="start", type=date.fromisoformat, default=today)
    parser.add_argument("--to", dest="end", type=date.fromisoformat, default=today + timedelta(weeks=6))
    parser.add_argument("--apply", action="store_true", help="save the merge (otherwise only report it)")
    args = parser.parse_args()
    from store import connect

    sb = connect()
    p = plan(sb, args.start, args.end)
    print(report(p))
    if args.apply:
        print("\nsaved:", apply(sb, p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
