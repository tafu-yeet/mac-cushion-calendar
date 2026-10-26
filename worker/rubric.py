"""Rubric (campus.hellorubric.com), the MSU's club platform, as a second event source.

Reads McMaster's Rubric listing through the JSON API its site uses
(POST api.hellorubric.com, form fields details=<json>&endpoint=<name>):
- getUnifiedSearch, desiredType "events": every listed event, 100 a page;
- getUnifiedSearch, desiredType "societies": every club, with the Instagram
  link the club gave Rubric, when it gave one;
- the event details call, which api.hellorubric.com passes on to Rubric's
  ticketing server: end time, address, description, ticket types, co-hosts.
MSU-run events come through the events search like any club's, under MSU
Campus Events, MSU Clubs and MSU Maroons; Rubric's "union events" filter
returns nothing at McMaster.

Politeness: at most one request a second, a User-Agent saying who we are, and
responses cached on disk (worker/cache/rubric): searches for 10 minutes, the
club list for a day, an event's details until its search entry changes or a
day passes. Every request is logged to fetch_logs (backend "rubric"). If
Rubric refuses us, the sync stops and says so; it doesn't try to get around it.

Each run upserts rubric_events and rubric_societies, so running it again
changes nothing Rubric hasn't changed. An event that drops off the listing is
marked missing_since, never deleted. map_societies() links Rubric clubs to
ours: by the Instagram link where there is one, else by name, sending unsure
name matches to review (the admin's Clubs page).

Usage (from worker/):
    python rubric.py              fetch now and map clubs
    python rubric.py --clubs      list how Rubric clubs map to ours
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

from curl_cffi import requests
from curl_cffi.requests.exceptions import RequestException
from supabase import Client

from clean import clean_place
from settings import CAMPUS, LOCAL_TZ, RUBRIC_USER_AGENT, WORKER_DIR

API_URL = "https://api.hellorubric.com"
SITE_URL = CAMPUS["rubric"]["siteUrl"]
DETAILS_ENDPOINT = "https://appserver.getqpay.com:9090/AppServerSwapnil/event/details"
PAGE_SIZE = 100
MIN_INTERVAL_S = 1.0  # at most one request a second
TIMEOUT_S = 30
CACHE_DIR = WORKER_DIR / "cache" / "rubric"
SEARCH_CACHE = timedelta(minutes=10)
SOCIETIES_CACHE = timedelta(days=1)
DETAILS_MAX_AGE = timedelta(days=1)
DEFAULT_IMAGE = "patterns/pattern_"  # Rubric's placeholder when a club sets no image

# Name matches at or above CONFIRM are linked; from REVIEW up they wait for a person.
CONFIRM, REVIEW = 0.9, 0.6


class RubricBlocked(Exception):
    """Rubric refused or challenged a request; stop rather than work around it."""


# Requests ------------------------------------------------------------------------

class RubricClient:
    def __init__(self, sb: Client | None = None, use_cache: bool = True) -> None:
        self.sb = sb
        self.use_cache = use_cache
        self.session = requests.Session()
        self.last_request = 0.0
        self.requests = 0

    def call(self, endpoint: str, details: dict, cache_for: timedelta | None) -> dict:
        """One API call, from the cache when it's fresh enough."""
        key = hashlib.sha1(json.dumps([endpoint, details], sort_keys=True).encode()).hexdigest()
        path = CACHE_DIR / f"{key}.json"
        if self.use_cache and cache_for and path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            if datetime.fromisoformat(cached["fetched_at"]) > datetime.now(timezone.utc) - cache_for:
                return cached["response"]

        wait = self.last_request + MIN_INTERVAL_S - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()
        self.requests += 1
        body = {**details, "device": "web_portal", "version": 4, "timestamp": int(time.time() * 1000)}
        label = details.get("eventId") or details.get("desiredType") or ""
        try:
            resp = self.session.post(
                API_URL,
                data={"details": json.dumps(body), "endpoint": endpoint},
                headers={"User-Agent": RUBRIC_USER_AGENT, "Origin": SITE_URL, "Referer": f"{SITE_URL}/"},
                timeout=TIMEOUT_S,
            )
        except RequestException as e:
            self.log(endpoint, label, None, "failed", 0, str(e))
            raise
        size = len(resp.content)
        try:
            data = resp.json()
        except ValueError:
            data = None
        if resp.status_code in (403, 429, 503) or data is None:
            # A block or a challenge page (Rubric sits behind Cloudflare): don't retry around it.
            self.log(endpoint, label, resp.status_code, "failed", size, "blocked or not JSON")
            raise RubricBlocked(f"{endpoint}: HTTP {resp.status_code}, {'not JSON' if data is None else 'refused'}")
        ok = resp.status_code == 200 and str(data.get("success", "true")).lower() == "true"
        self.log(endpoint, label, resp.status_code, "ok" if ok else "failed", size, "" if ok else str(data.get("error"))[:200])
        if not ok:
            raise RuntimeError(f"{endpoint} failed: HTTP {resp.status_code} {data.get('error')}")
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"fetched_at": datetime.now(timezone.utc).isoformat(), "response": data}), encoding="utf-8")
        return data

    def log(self, endpoint: str, label: str, status: int | None, outcome: str, size: int, detail: str) -> None:
        """Every request goes in fetch_logs, like the Instagram fetches."""
        if self.sb is None:
            return
        self.sb.table("fetch_logs").insert({
            "club_id": None, "username": f"rubric:{endpoint.rsplit('/', 1)[-1]}", "backend": "rubric", "attempt": 1,
            "http_status": status, "outcome": outcome, "response_bytes": size, "via": "direct",
            "detail": f"{label} {detail}".strip()[:1000],
        }).execute()

    def search(self, desired_type: str, sort_type: str) -> list[dict]:
        """Every page of a McMaster search."""
        rubric = CAMPUS["rubric"]
        results, offset = [], 0
        while True:
            data = self.call("getUnifiedSearch", {
                "firstCall": False, "sortType": sort_type, "desiredType": desired_type, "limit": PAGE_SIZE,
                "offset": offset, "sortDirection": "asc", "searchQuery": "", "eventsPeriodFilter": "All", "showall": True,
                "countryCode": rubric["countryCode"], "state": rubric["state"], "selectedUniversityId": rubric["universityId"],
            }, SOCIETIES_CACHE if desired_type == "societies" else SEARCH_CACHE)
            page = data.get("results") or []
            results += page
            offset += PAGE_SIZE
            if len(page) < PAGE_SIZE or offset >= int(data.get("totalItemCount") or 0):
                return results

    def events(self) -> list[dict]:
        return self.search("events", "date")

    def societies(self) -> list[dict]:
        return self.search("societies", "itemName")

    def details(self, eid: int, fresh: bool) -> dict:
        return self.call(
            DETAILS_ENDPOINT,
            {"eventId": str(eid), "currentUrl": f"{SITE_URL}/?eid={eid}"},
            None if fresh else DETAILS_MAX_AGE,
        )


# Parsing -------------------------------------------------------------------------

def event_id(result: dict) -> int:
    return int(re.search(r"eid=(\d+)", result["destination"]).group(1))


def local_time(text: str | None) -> datetime | None:
    """"Wed, 21 Oct 2026 9:00 PM" (campus time) as an aware datetime."""
    if not text:
        return None
    try:
        return datetime.strptime(text.strip(), "%a, %d %b %Y %I:%M %p").replace(tzinfo=LOCAL_TZ)
    except ValueError:
        return None


# Address parts that say where the campus is, not where on campus.
ADDRESS_TAIL = re.compile(
    r"^(\d+\s.*|.*\b(street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|way|lane)\b( (west|east|north|south|w|e|n|s))?\.?"
    r"|hamilton|ontario|on|canada|[a-z]\d[a-z] ?\d[a-z]\d)$",
    re.I,
)


def tidy_location(address: str | None) -> str | None:
    """"MUSC Clubspace , McMaster University Student Centre, Main Street West, Hamilton, ON, Canada"
    -> "MUSC Clubspace, McMaster University Student Centre"."""
    if not address:
        return None
    parts = [p.strip() for p in address.split(",") if p.strip()]
    kept = []
    for p in parts:
        if ADDRESS_TAIL.match(p):
            break
        if p.lower() not in (k.lower() for k in kept):  # Rubric sometimes repeats the building
            kept.append(p)
    return clean_place(", ".join(kept or parts[:1]))


def plain_text(markup: str | None) -> str | None:
    if not markup:
        return None
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h\d)>", "\n", markup)
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).replace("\xa0", " ")
    text = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip() or None


def parse_event(result: dict, detail: dict | None) -> dict:
    """A rubric_events row from a search result and, when fetched, its details."""
    d = (detail or {}).get("eventDetails") or {}
    eid = event_id(result)
    starts = datetime.fromtimestamp(int(result["sortindex"]), timezone.utc)
    ends = local_time(d.get("eventEndTime"))
    image = d.get("bannerImageURL") or result.get("image")
    tickets = [
        {"name": t.get("name"), "amount": float(t.get("amount") or 0), "open": str(t.get("ticketSaleOpen")).lower() == "true"}
        for t in d.get("ticketTypeDetails") or []
    ]
    collaborators = sorted({
        int(c["societyId"]) for c in (detail or {}).get("collaboratorDetails") or []
        if str(c.get("societyId")) != str(result["societyid"])
    })
    row = {
        "eid": eid,
        "society_id": int(result["societyid"]),
        "title": result["title"].strip(),
        "category": result.get("subtitle"),
        "price_info": result.get("info"),
        "starts_at": starts.isoformat(),
        "ends_at": ends.astimezone(timezone.utc).isoformat() if ends and ends > starts else None,
        "location": tidy_location(d.get("eventAddress")),
        "address": d.get("eventAddress"),
        "description": plain_text(d.get("eventDescription")),
        "tickets": tickets,
        "collaborator_ids": collaborators,
        "image_url": None if not image or DEFAULT_IMAGE in image else image,
        "url": f"{SITE_URL}/?eid={eid}",
        "rubric_status": d.get("eventStatus"),
        "search": result,
    }
    if detail is not None:
        row["detail"] = detail
    row["content_hash"] = hashlib.sha1(json.dumps(
        [row[k] for k in ("title", "starts_at", "ends_at", "location", "price_info", "tickets", "description",
                          "collaborator_ids", "rubric_status")],
        sort_keys=True,
    ).encode()).hexdigest()
    return row


def instagram_username(url: str | None) -> str | None:
    m = re.search(r"instagram\.com/([A-Za-z0-9._]{1,30})", url or "")
    return m.group(1).lower().rstrip(".") if m else None


# Sync ----------------------------------------------------------------------------

@dataclass
class SyncResult:
    events: int = 0
    new: list[int] = field(default_factory=list)
    changed: list[int] = field(default_factory=list)
    missing: list[int] = field(default_factory=list)
    back: list[int] = field(default_factory=list)
    societies: int = 0
    requests: int = 0


def fetch_all(query_for_range) -> list[dict]:
    rows, start = [], 0
    while True:
        page = query_for_range(start, start + 999).execute().data
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def sync(sb: Client, client: RubricClient | None = None) -> SyncResult:
    """Fetch Rubric's listing and upsert it. Safe to run again: unchanged records stay as they are."""
    client = client or RubricClient(sb)
    out = SyncResult()
    started = datetime.now(timezone.utc)

    societies = client.societies()
    sb.table("rubric_societies").upsert([
        {"society_id": int(s["societyid"]), "name": s["title"].strip(),
         "instagram_username": instagram_username(s.get("instagramurl")), "raw": s, "updated_at": started.isoformat()}
        for s in societies
    ], on_conflict="society_id").execute()
    out.societies = len(societies)

    results = client.events()
    known_societies = {int(s["societyid"]) for s in societies}
    extra = {int(r["societyid"]): r["societyname"] for r in results if int(r["societyid"]) not in known_societies}
    if extra:  # an event from a club the club list didn't include
        sb.table("rubric_societies").upsert(
            [{"society_id": sid, "name": name.strip(), "updated_at": started.isoformat()} for sid, name in extra.items()],
            on_conflict="society_id",
        ).execute()

    existing = {
        r["eid"]: r for r in fetch_all(lambda a, b: sb.table("rubric_events").select(
            "eid, content_hash, search, detail, detail_fetched_at, missing_since").range(a, b))
    }
    for result in results:
        eid = event_id(result)
        old = existing.get(eid)
        listed_changed = old is None or old["search"] != result
        stale = old is None or not old["detail_fetched_at"] or (
            datetime.fromisoformat(old["detail_fetched_at"]) < started - DETAILS_MAX_AGE)
        upcoming = int(result["sortindex"]) >= started.timestamp() - 86400
        detail, fetched = (old or {}).get("detail"), False
        if old is None or listed_changed or (stale and upcoming):
            try:
                detail, fetched = client.details(eid, fresh=listed_changed), True
            except RuntimeError as e:  # one event's details failing shouldn't stop the rest
                print(f"  Rubric details for {eid} failed: {e}")
        row = parse_event(result, detail)
        row["last_seen_at"] = started.isoformat()
        row["missing_since"] = None
        if fetched:
            row["detail_fetched_at"] = started.isoformat()
        if old is None:
            out.new.append(eid)
        elif old["content_hash"] != row["content_hash"]:
            out.changed.append(eid)
            row["changed_at"] = started.isoformat()
        if old and old["missing_since"]:
            out.back.append(eid)
        sb.table("rubric_events").upsert(row, on_conflict="eid").execute()
    out.events = len(results)

    # Upcoming events Rubric no longer lists: keep them, mark them, let merge.py flag theirs.
    listed = {event_id(r) for r in results}
    upcoming = [eid for eid, r in existing.items()
                if not r["missing_since"] and int(r["search"].get("sortindex", 0)) >= started.timestamp()]
    gone = [eid for eid in upcoming if eid not in listed]
    # Most of them gone at once is a short or failed listing, not a wave of cancellations:
    # marking them would put "Check before you go" on nearly every event.
    if len(gone) > max(5, len(upcoming) // 3):
        print(f"  Rubric listed {len(results)} events but {len(gone)} of {len(upcoming)} upcoming ones are missing: "
              "not marking them (a bad fetch?)")
        gone = []
    if gone:
        sb.table("rubric_events").update({"missing_since": started.isoformat()}).in_("eid", gone).execute()
    out.missing = gone
    out.requests = client.requests
    return out


# Club mapping ----------------------------------------------------------------------

GENERIC_WORDS = {
    "mcmaster", "mac", "university", "the", "of", "at", "and", "club", "team", "chapter", "msu", "mcmasteru",
    "inc", "official", "group",
}
# Words that describe almost any club, so sharing one says little.
COMMON_WORDS = {
    "students", "student", "association", "society", "council", "network", "committee", "community", "alliance",
    "union", "organization", "collective", "initiative", "project",
}


def _fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower().replace("&", " and ").replace("’", "'"))
    return re.sub(r"[^a-z0-9\s]", " ", re.sub(r"'s\b", "s", text))


def name_words(name: str) -> list[str]:
    return [w for w in _fold(name).split() if w not in GENERIC_WORDS]


def acronyms(name: str) -> set[str]:
    """"McMaster Chinese Students Association" -> {"csa", "mcsa"}; "(MSB)" -> "msb"; "PSA" -> "psa"."""
    found = {re.sub(r"[^a-z0-9]", "", inner.lower()) for inner in re.findall(r"\(([A-Za-z0-9.\- ]{2,12})\)", name)}
    found |= {w.lower() for w in re.findall(r"\b[A-Z]{2,6}\b", name)}
    # Initials of the name itself, without what's in brackets: with and without "McMaster".
    folded = _fold(re.sub(r"\([^)]*\)", " ", name)).split()
    with_school = [w for w in folded if w not in {"of", "the", "and", "at", "for"}]
    without = [w for w in folded if w not in GENERIC_WORDS]
    for words in (with_school, without):
        if len(words) >= 2:
            found.add("".join(w[0] for w in words))
    return {a for a in found if len(a) >= 3}


def handle_core(username: str) -> str:
    """"mcmastercsa" -> "csa", "macbhangra" -> "bhangra", "zerowastemcmaster" -> "zerowaste"."""
    core = username.lower().replace("_", "").replace(".", "")
    for word in ("mcmasteru", "mcmaster", "mac", "msu"):
        if core.startswith(word) and len(core) > len(word) + 1:
            core = core[len(word):]
        if core.endswith(word) and len(core) > len(word) + 1:
            core = core[: -len(word)]
    return core


def aliases_for(name: str) -> list[str]:
    """Other names in a Rubric club's name: "MacJong (McMaster Mahjong Club)" -> ["MacJong", "McMaster Mahjong Club"]."""
    out = []
    for inner in re.findall(r"\(([^)]+)\)", name):
        out.append(inner.strip())
    outer = re.sub(r"\s*\([^)]*\)", "", name).strip()
    if outer and outer != name.strip():
        out.append(outer)
    for part in re.split(r"\s+[|–—-]\s+", name):
        if part.strip() and part.strip() != name.strip():
            out.append(part.strip())
    return list(dict.fromkeys(a for a in out if len(a) >= 2))


def name_score(society: str, club_name: str, username: str, distinctive: dict[str, int]) -> tuple[float, str]:
    """How likely a Rubric club and one of ours are the same, from names alone, and why."""
    best, why = 0.0, ""

    def consider(score: float, reason: str) -> None:
        nonlocal best, why
        if score > best:
            best, why = score, reason

    def singular(w: str) -> str:
        return w[:-1] if w.endswith("s") and not w.endswith("ss") and len(w) > 4 else w

    def all_words(name: str) -> set[str]:
        return {singular(w) for w in name_words(name)}

    def key_words(name: str) -> list[str]:
        """The words that tell clubs apart: not "McMaster", not "Students Association"."""
        return [singular(w) for w in name_words(name) if w not in COMMON_WORDS]

    def short_name(name: str) -> bool:
        """An alias like "MCS" or "MSB": too short to compare as a name."""
        return len(name.split()) == 1 and len(name) <= 6

    # Only the telling words are compared, so "Iraqi Students' Association" and
    # "Iranian Students' Association" don't look alike for sharing the rest.
    for s_name in [society, *(a for a in aliases_for(society) if not short_name(a))]:
        for c_name in [club_name, *(a for a in aliases_for(club_name) if not short_name(a))]:
            a, b = key_words(s_name), key_words(c_name)
            if not a or not b:
                continue
            if all_words(s_name) == all_words(c_name):
                consider(0.97, f"same name: {s_name!r} = {c_name!r}")
            elif set(a) == set(b):
                # "McMaster Comedy Collective" and "McMaster Comedy" may be two clubs.
                consider(0.93 if len(set(a)) >= 2 else 0.85, f"same key words: {s_name!r} ~ {c_name!r}")
            else:
                ratio = SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()
                # One word spelled alike ("chess", "chegss") isn't enough to link without a person.
                consider(ratio if min(len(a), len(b)) >= 2 else min(ratio, 0.85), f"names: {s_name!r} ~ {c_name!r}")
    # A short name in brackets that is our handle: "(MDA)" and @macmda. Initials alone
    # ("MCC") fit too many clubs to go further than review.
    core = handle_core(username)
    handle = {core, username.replace(".", "").replace("_", "")}
    compact = [re.sub(r"[^a-z0-9]", "", a.lower()) for a in aliases_for(society)]
    explicit = {a for a in compact if 2 <= len(a) <= 10}  # "MDA", "Mac NDP" -> "macndp"
    if explicit & handle:
        consider(0.92, f"short name {sorted(explicit & handle)[0].upper()} is @{username}")
    elif acronyms(society) & (handle | {w.lower() for w in re.findall(r"\b[A-Z]{2,6}\b", club_name)}):
        consider(0.75, f"initials match @{username} / {club_name!r}")
    # A word of the Rubric name that only one of our clubs uses: "bhangra" in macbhangra.
    for w in set(key_words(society)):
        if len(w) >= 6 and distinctive.get(w, 0) == 1 and (w in core or w in name_words(club_name)):
            consider(0.75, f"rare word {w!r}")
    return round(best, 3), why


def map_societies(sb: Client, verbose: bool = False) -> dict[str, int]:
    """Link Rubric clubs to ours. A person's decisions (method "person", or "rejected") are kept,
    and so are matches a club's own bio confirmed (method "bio", from bio_links.map_rubric)."""
    clubs = fetch_all(lambda a, b: sb.table("clubs").select("id, instagram_username, name").range(a, b))
    by_handle = {c["instagram_username"]: c for c in clubs}
    socs = fetch_all(lambda a, b: sb.table("rubric_societies").select(
        "society_id, name, instagram_username, club_id, match_method, match_status").range(a, b))
    # How many of our clubs use each word, to tell rare words from common ones.
    distinctive: dict[str, int] = {}
    for c in clubs:
        for w in set(name_words(c["name"])) | {handle_core(c["instagram_username"])}:
            distinctive[w] = distinctive.get(w, 0) + 1

    counts = {"instagram": 0, "name": 0, "review": 0, "none": 0, "kept": 0}
    updates = []
    for s in socs:
        if s["match_method"] in ("person", "bio") or s["match_status"] == "rejected":
            counts["kept"] += 1
            continue
        update = {"society_id": s["society_id"], "name": s["name"], "aliases": aliases_for(s["name"])}
        handle = s["instagram_username"]
        if handle and handle in by_handle:
            update |= {"club_id": by_handle[handle]["id"], "match_method": "instagram", "match_score": 1.0, "match_status": "confirmed"}
            counts["instagram"] += 1
        else:
            scored = sorted(
                ((*name_score(s["name"], c["name"], c["instagram_username"], distinctive), c) for c in clubs),
                key=lambda x: -x[0],
            )
            (score, why, club), runner_up = scored[0], scored[1][0] if len(scored) > 1 else 0.0
            close_call = score - runner_up < 0.05
            # Rubric names an Instagram account we don't follow: maybe the club moved accounts,
            # maybe it's another club, so a name match only goes to review.
            if score >= CONFIRM and not close_call and not handle:
                status = "confirmed"
                counts["name"] += 1
            elif score >= REVIEW:
                status = "review"
                counts["review"] += 1
            else:
                status = "none"
                counts["none"] += 1
            update |= {
                "club_id": club["id"] if status != "none" else None,
                "match_method": "name" if status != "none" else None,
                "match_score": score,
                "match_status": status,
            }
            if verbose and status != "confirmed":
                note = f" (Rubric's Instagram link @{handle} isn't one of our clubs)" if handle else ""
                print(f"  {status:6} {score:.2f} {s['name'][:50]:50} -> @{club['instagram_username']} [{why}]{note}")
        updates.append(update)
    for i in range(0, len(updates), 200):
        sb.table("rubric_societies").upsert(updates[i : i + 200], on_conflict="society_id").execute()
    return counts


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Fetch McMaster's Rubric listing and map its clubs to ours.")
    parser.add_argument("--clubs", action="store_true", help="also list Rubric clubs that aren't confidently mapped")
    args = parser.parse_args()
    from store import connect

    sb = connect()
    result = sync(sb)
    print(f"Rubric: {result.events} events ({len(result.new)} new, {len(result.changed)} changed, "
          f"{len(result.missing)} no longer listed, {len(result.back)} back), {result.societies} clubs, "
          f"{result.requests} request(s)")
    counts = map_societies(sb, verbose=args.clubs)
    print(f"clubs mapped: {counts['instagram']} by Instagram link, {counts['name']} by name; "
          f"{counts['review']} to review, {counts['none']} unmatched, {counts['kept']} decided by a person")
    return 0


if __name__ == "__main__":
    sys.exit(main())
