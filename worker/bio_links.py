"""Links in clubs' Instagram bios, and on the link-in-bio pages they lead to
(Linktree and the like). Clubs send people there to sign up, so the links say:

- which Rubric club a club is: a bio linking one Rubric club page (?s=ID), or
  that club's events (?eid=ID), confirms the match (rubric_societies, method
  "bio"), better than names can. A bio linking several Rubric clubs (a hub)
  confirms nothing;
- which Rubric event an Instagram post is about: merge.py counts a bio link to
  the Rubric event as strong evidence for a same-day match;
- where "link in bio" registration really goes: the link whose title names
  the event, or the event's own Rubric link (registration.py, and refresh()).

The profile page carries the bio links, so they come with every fetch for
free. A link-in-bio page is read when the bio changes or once a day at most,
directly (it isn't Instagram, so no proxy), and logged like every fetch.

Usage (from worker/):
    python bio_links.py --fetch-upcoming   fetch clubs with events in the next 2 weeks, then match
    python bio_links.py                    match Rubric clubs and registration links from saved links
"""

from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from curl_cffi import requests
from curl_cffi.requests.exceptions import RequestException
from supabase import Client

from auto_approve import name_similarity, word_overlap
from fetchers import Attempt
from rubric import fetch_all
from settings import CAMPUS

LINK_PAGE_HOSTS = (
    "linktr.ee", "linktree.com", "beacons.ai", "beacons.page", "linkin.bio", "lnk.bio", "bio.site", "campsite.bio",
    "linkpop.com", "tap.bio", "hoo.be", "solo.to", "msha.ke", "allmylinks.com", "taplink.cc", "flow.page", "linkr.bio",
    "many.link", "direct.me", "linkbio.co", "bio.link", "carrd.co",
)
SOCIAL_HOSTS = ("instagram.com", "tiktok.com", "facebook.com", "twitter.com", "x.com", "youtube.com", "linkedin.com",
                "discord.gg", "discord.com", "spotify.com", "threads.net", "snapchat.com", "whatsapp.com")
# Forms and ticketing or booking sites: a link to one is a sign-up link. The campus's own
# (OSCARplus, the MSU store, MacRec...) are in campus.config.json.
FORM_HOSTS = ("forms.gle", "docs.google.com/forms", "forms.office.com", "forms.cloud.microsoft", "typeform.com",
              "jotform.com", "eventbrite.", "lu.ma", "luma.com", "tally.so", "showpass.com", "tickettailor.com",
              "zeffy.com", "universe.com", *CAMPUS.get("registrationHosts", []))
RUBRIC_SOCIETY = re.compile(r"hellorubric\.com/.*?[?&]s=(\d+)", re.I)
RUBRIC_EVENT = re.compile(r"hellorubric\.com/.*?[?&]eid=(\d+)", re.I)
SIGN_UP = re.compile(r"\b(sign[ -]?ups?|register|registration|rsvp|tickets?|apply|application|form|join)\b", re.I)
NOT_SIGN_UP = re.compile(r"\b(survey|feedback|poll|vote|voting|questionnaire|nominations?)\b", re.I)
PAGE_EVERY = timedelta(hours=24)
MAX_LINKS = 40
TIMEOUT_S = 20
ANCHOR = re.compile(r"<a\b[^>]*?href=\"(https?://[^\"]+)\"[^>]*>(.*?)</a>", re.S | re.I)


# Reading (the bio links themselves come from fetchers/profile_page.py) -----------

def host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def is_link_page(url: str) -> bool:
    return any(host(url) == h or host(url).endswith("." + h) for h in LINK_PAGE_HOSTS)


def read_link_page(url: str) -> tuple[list[dict], int | None, int, str | None]:
    """The links on a link-in-bio page: ([{url, title}], HTTP status, bytes, error)."""
    try:
        resp = requests.get(url, impersonate="chrome", timeout=TIMEOUT_S, allow_redirects=True)
    except RequestException as e:
        return [], None, 0, str(e)
    if resp.status_code != 200:
        return [], resp.status_code, len(resp.content), f"HTTP {resp.status_code}"
    page_host, out, seen = host(url), [], set()
    for href, inner in ANCHOR.findall(resp.text):
        href = htmllib.unescape(href)
        if host(href) == page_host or href in seen or any(host(href).endswith(s) for s in SOCIAL_HOSTS):
            continue
        seen.add(href)
        title = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", inner)).split())[:120]
        out.append({"url": href, "title": title})
        if len(out) >= MAX_LINKS:
            break
    return out, 200, len(resp.content), None


def kind(url: str) -> str:
    if RUBRIC_EVENT.search(url):
        return "rubric_event"
    if RUBRIC_SOCIETY.search(url):
        return "rubric_society"
    if any(f in url.lower() for f in FORM_HOSTS):
        return "form"
    return "other"


def rubric_ids(links: list[dict], pattern: re.Pattern) -> set[int]:
    return {int(m.group(1)) for l in links if (m := pattern.search(l["url"]))}


# Saving ----------------------------------------------------------------------------

def update(sb: Client, club: dict, bio: list[dict] | None) -> list[dict]:
    """Save a club's bio links from a fresh fetch, reading its link-in-bio page when the bio
    changed or the page wasn't read today. Returns the club's links."""
    if bio is None:  # a backend without bios (Apify)
        return []
    from store import log_attempt, now  # store imports the fetchers; keep this module light for its own CLI

    row = sb.table("clubs").select("links, links_checked_at").eq("id", club["id"]).single().execute().data
    old = row["links"] or []
    bio_links = [{"url": l["url"], "title": l["title"], "via": "bio"} for l in bio]
    same_bio = [l["url"] for l in old if l.get("via") == "bio"] == [l["url"] for l in bio_links]
    fresh = row["links_checked_at"] and datetime.fromisoformat(row["links_checked_at"]) > now() - PAGE_EVERY
    if same_bio and fresh:
        page_links = [l for l in old if l.get("via") != "bio"]
        update = {"links": bio_links + page_links}
    else:
        page_links = []
        for l in bio_links:
            if not is_link_page(l["url"]):
                continue
            found, status, size, error = read_link_page(l["url"])
            log_attempt(sb, club["id"], Attempt(club["instagram_username"], "link_page", 1, status,
                                                "ok" if not error else "failed", size, host(l["url"]), error or ""))
            page_links += [f | {"via": host(l["url"])} for f in found]
            time.sleep(1)
        update = {"links": bio_links + page_links, "links_checked_at": now().isoformat()}
    if update["links"] != old or "links_checked_at" in update:
        sb.table("clubs").update(update).eq("id", club["id"]).execute()
    return update["links"]


# Using -----------------------------------------------------------------------------

def map_rubric(sb: Client, verbose: bool = False) -> dict[str, int]:
    """Confirm Rubric club matches from clubs' links. A person's decision stands, and a
    club linking several Rubric clubs (a hub) or a Rubric club Rubric itself ties to
    another Instagram account confirms nothing."""
    clubs = [c for c in fetch_all(lambda a, b: sb.table("clubs").select("id, instagram_username, name, links").range(a, b))
             if c["links"]]
    eids = sorted({e for c in clubs for e in rubric_ids(c["links"], RUBRIC_EVENT)})
    event_society = {}
    for i in range(0, len(eids), 200):
        for r in sb.table("rubric_events").select("eid, society_id").in_("eid", eids[i:i + 200]).execute().data:
            event_society[r["eid"]] = r["society_id"]
    socs = {s["society_id"]: s for s in fetch_all(lambda a, b: sb.table("rubric_societies").select(
        "society_id, name, club_id, match_method, match_status").range(a, b))}

    counts = {"confirmed": 0, "already": 0, "hub": 0, "kept": 0}
    for c in clubs:
        linked = rubric_ids(c["links"], RUBRIC_SOCIETY) | {event_society[e] for e in rubric_ids(c["links"], RUBRIC_EVENT)
                                                          if e in event_society}
        linked &= set(socs)
        if not linked:
            continue
        if len(linked) > 1:
            counts["hub"] += 1
            continue
        s = socs[linked.pop()]
        if s["club_id"] == c["id"] and s["match_status"] == "confirmed":
            counts["already"] += 1
            continue
        if s["match_method"] in ("person", "instagram") or s["match_status"] == "rejected":
            counts["kept"] += 1
            if verbose:
                print(f"  kept {s['match_method']}: Rubric “{s['name']}” (@{c['instagram_username']}'s bio links it)")
            continue
        sb.table("rubric_societies").update({"club_id": c["id"], "match_method": "bio", "match_score": 1.0,
                                              "match_status": "confirmed"}).eq("society_id", s["society_id"]).execute()
        counts["confirmed"] += 1
        if verbose:
            print(f"  confirmed: Rubric “{s['name']}” is @{c['instagram_username']} (was {s['match_status']} by {s['match_method']})")
    return counts


def registration_link(links: list[dict], event_name: str, rubric_eid: int | None) -> dict | None:
    """The club's link for registering for this event: its Rubric event link, or a link
    whose title names the event. None when no link clearly belongs to it."""
    if rubric_eid:
        for l in links:
            if (m := RUBRIC_EVENT.search(l["url"])) and int(m.group(1)) == rubric_eid:
                return l
    best, best_score = None, 0.0
    for l in links:
        if not l.get("title") or kind(l["url"]) == "rubric_society" or is_link_page(l["url"]):
            continue
        # Only a sign-up link: a form, a Rubric event, or a title that says so (not "Program Website"),
        # and not a form for something else ("Family Feud Survey!", "Give us your feedback!").
        if kind(l["url"]) not in ("form", "rubric_event") and not SIGN_UP.search(l["title"]):
            continue
        if NOT_SIGN_UP.search(l["title"]):
            continue
        score = max(word_overlap(event_name, l["title"]), name_similarity(event_name, l["title"]))
        if score > best_score:
            best, best_score = l, score
    return best if best_score >= 0.6 else None


def refresh(sb: Client, verbose: bool = False) -> int:
    """Give upcoming "link in bio" registrations the specific link, where the club's links have one."""
    now = datetime.now(timezone.utc)
    events = fetch_all(lambda a, b: sb.table("events").select(
        "id, name, rubric_eid, ticket_url, registration_where, registration_url, reviewed_fields, clubs(links)")
        .in_("status", ["approved", "pending"]).eq("registration_where", "link_in_bio").is_("registration_url", "null")
        .gte("starts_at", (now - timedelta(hours=6)).isoformat()).range(a, b))
    done = 0
    for e in events:
        if "registration" in (e["reviewed_fields"] or []):
            continue
        link = registration_link((e.get("clubs") or {}).get("links") or [], e["name"], e["rubric_eid"])
        if not link:
            continue
        where = {"rubric_event": "rubric", "form": "form"}.get(kind(link["url"]), "link_in_bio")
        sb.table("events").update({"registration_url": link["url"][:500], "registration_where": where}).eq("id", e["id"]).execute()
        done += 1
        if verbose:
            print(f"  #{e['id']} {e['name'][:45]} -> {link['title'][:40]} ({link['url'][:70]})")
    return done


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Use clubs' bio links to match Rubric clubs and registration links.")
    parser.add_argument("--fetch-upcoming", action="store_true",
                        help="first fetch every club with an event in the next 2 weeks (reads their bios)")
    args = parser.parse_args()
    from store import connect

    sb = connect()
    if args.fetch_upcoming:
        import random

        from recheck import FETCH_DELAY_S, upcoming_events
        from run import fetch_club

        clubs = list({e["clubs"]["id"]: e["clubs"] for e in upcoming_events(sb)}.values())
        print(f"Fetching {len(clubs)} club profile(s)")
        for i, club in enumerate(clubs):
            if i:
                time.sleep(random.uniform(*FETCH_DELAY_S))
            try:
                fetch_club(sb, club)
            except (Exception, SystemExit) as e:  # noqa: BLE001
                print(f"  @{club['instagram_username']}: fetch failed ({type(e).__name__}: {e})")
    print("Rubric clubs:", map_rubric(sb, verbose=True))
    print(f"{refresh(sb, verbose=True)} registration link(s) found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
