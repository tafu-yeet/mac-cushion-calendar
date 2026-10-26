"""Which communities each club and event is for (campus.config.json
"communities": Pride, women, a faith, a culture, a program...), for the site's
/communities page.

- A club's communities come from its name and account: the Muslim Students'
  Association is Muslim; the Chinese Students' Association, East Asian;
  Engineering Society, Engineering; NSBE, Black & African and Engineering. A
  general club (a hobby, a sport, a charity) has none. Sonnet reads clubs fifty
  at a time; new clubs get read as they're added.
- An event has its club's communities, plus any its own words add: a
  women-only Pilates class from Islamic Relief, Diwali from a general club, an
  engineering networking night from a career club. Haiku reads new and edited
  events a batch at a time, like registration.py.

A person's choice for an event ("communities" in reviewed_fields) is kept.

Usage (from worker/):
    python communities.py            tag clubs and events not tagged yet
    python communities.py --all      tag every club and upcoming event again
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

import anthropic
import httpx
from pydantic import BaseModel
from supabase import Client

from extractors import Usage
from extractors.claude import model_options
from rubric import fetch_all
from settings import CAMPUS, CHECK_EFFORT, CLAUDE_EFFORT, CLAUDE_MODEL, VERIFY_MODEL

KEYS = [c["key"] for c in CAMPUS["communities"]]
CLUBS_PER_CALL = 50
EVENTS_PER_CALL = 15
PAST_DAYS = 1
AHEAD_WEEKS = 8


def taxonomy() -> str:
    lines = []
    for c in CAMPUS["communities"]:
        hint = f" ({c['hint']})" if c.get("hint") else ""
        lines.append(f"- {c['key']}: {c['label']}{hint} [{c['group']}]")
    return "\n".join(lines)


RULES = f"""You tag {CAMPUS['school']} student clubs and events with the communities they're for, so students can \
find events for their community. Use only these keys:
{{taxonomy}}

A tag means the club or event centres on that community: a faith club or a faith-based charity is that faith; a \
cultural, heritage or language association is its region (a country's association goes in its region, e.g. Persian \
or Turkish in mena, Tamil or Punjabi in south_asian, Filipino in southeast_asian); a faculty or program society, \
department or program office is that program; a 2SLGBTQIA+ group is pride; a group for women or gender equity is \
women; an international or exchange students' group is international; a graduate students' group is graduate. Use \
several when they all apply (a Muslim women's group: muslim, women; Black engineers: black_african, engineering). \
A general club (a hobby, a sport, a game, a charity, a service club, a campus-wide office) gets none, even if \
its members are mostly one group. Never guess from a person's name or a club's location."""

EVENT_RULES = """For events: give only what the event itself adds beyond its club's communities, from its name and \
caption: who it's for or what it celebrates. A women-, girls- or sisters-only event is women; a Diwali or Navratri \
event is south_asian and hindu, Vaisakhi south_asian and sikh, Lunar New Year east_asian, Eid or an iftar muslim, \
Hanukkah or Shabbat jewish, Christmas mass christian, Pride week pride; an event for one program's students is that \
program. Most events add nothing: answer an empty list. Never repeat the club's own tags."""


class Tagged(BaseModel):
    id: int
    communities: list[str]


class Tags(BaseModel):
    items: list[Tagged]


def ask(client: anthropic.Anthropic, model: str, effort: str, system: str, listing: str) -> tuple[dict[int, list[str]], Usage]:
    response = client.beta.messages.parse(
        model=model, max_tokens=16000, **model_options(model, effort),
        system=system, messages=[{"role": "user", "content": listing}], output_format=Tags,
    )
    usage = Usage(model=response.model, stop_reason=response.stop_reason, input_tokens=response.usage.input_tokens,
                  output_tokens=response.usage.output_tokens)
    if response.parsed_output is None:
        raise RuntimeError(f"no answer (stop_reason: {response.stop_reason})")
    return {t.id: sorted({k for k in t.communities if k in KEYS}) for t in response.parsed_output.items}, usage


def tag_clubs(sb: Client, client: anthropic.Anthropic, everything: bool, verbose: bool) -> int:
    from store import log_usage, now

    clubs = [c for c in fetch_all(lambda a, b: sb.table("clubs").select(
        "id, instagram_username, name, communities, communities_checked_at").range(a, b))
        if everything or not c["communities_checked_at"]]
    # The club's full name on Rubric, when we know it: "McMaster TSA" is the Turkish Students
    # Association there, not the Taiwanese one an acronym suggests.
    rubric_names = {s["club_id"]: s["name"] for s in fetch_all(lambda a, b: sb.table("rubric_societies").select(
        "club_id, name").eq("match_status", "confirmed").not_.is_("club_id", "null").range(a, b))}
    system = RULES.replace("{taxonomy}", taxonomy()) + "\n\nAnswer for every club id."
    done = 0
    for i in range(0, len(clubs), CLUBS_PER_CALL):
        chunk = clubs[i:i + CLUBS_PER_CALL]
        listing = "\n".join(
            f"{c['id']} | @{c['instagram_username']} | {c['name']}"
            + (f" | on Rubric: {rubric_names[c['id']]}" if c["id"] in rubric_names else "")
            for c in chunk
        )
        try:
            tags, usage = ask(client, VERIFY_MODEL, CHECK_EFFORT, system, listing)
            log_usage(sb, None, usage, "communities-clubs")
        except (anthropic.APIError, httpx.HTTPError, RuntimeError) as e:
            print(f"  communities: skipped {len(chunk)} club(s) for now ({type(e).__name__}: {e})")
            continue
        for c in chunk:
            new = tags.get(c["id"], [])
            sb.table("clubs").update({"communities": new, "communities_checked_at": now().isoformat()}).eq("id", c["id"]).execute()
            done += 1
            if verbose and new:
                print(f"  @{c['instagram_username']:28} {', '.join(new)}")
    return done


def tag_events(sb: Client, client: anthropic.Anthropic, everything: bool, verbose: bool) -> int:
    from store import log_usage, now

    lo = (datetime.now(timezone.utc) - timedelta(days=PAST_DAYS)).isoformat()
    hi = (datetime.now(timezone.utc) + timedelta(weeks=AHEAD_WEEKS)).isoformat()
    events = fetch_all(lambda a, b: sb.table("events").select(
        "id, name, communities_checked_at, reviewed_fields, posts(caption, caption_changed_at), clubs(name, communities)")
        .in_("status", ["approved", "pending"]).gte("starts_at", lo).lt("starts_at", hi).range(a, b))

    def stale(e: dict) -> bool:
        if "communities" in (e["reviewed_fields"] or []):
            return False
        changed = (e.get("posts") or {}).get("caption_changed_at")
        return everything or not e["communities_checked_at"] or bool(changed and changed > e["communities_checked_at"])

    todo = [e for e in events if stale(e)]
    system = RULES.replace("{taxonomy}", taxonomy()) + "\n\n" + EVENT_RULES + " Answer for every event id."
    done = 0
    for i in range(0, len(todo), EVENTS_PER_CALL):
        chunk = todo[i:i + EVENTS_PER_CALL]
        listing = "\n\n".join(
            f"### Event {e['id']}: {e['name']}\nclub: {(e.get('clubs') or {}).get('name', '')} "
            f"(club's tags: {', '.join((e.get('clubs') or {}).get('communities') or []) or 'none'})\n"
            f"caption: {' '.join(((e.get('posts') or {}).get('caption') or '').split())[:700]}"
            for e in chunk
        )
        try:
            tags, usage = ask(client, CLAUDE_MODEL, CLAUDE_EFFORT, system, listing)
            log_usage(sb, None, usage, "communities-events")
        except (anthropic.APIError, httpx.HTTPError, RuntimeError) as e:
            print(f"  communities: skipped {len(chunk)} event(s) for now ({type(e).__name__}: {e})")
            continue
        for e in chunk:
            own = set((e.get("clubs") or {}).get("communities") or [])
            new = sorted(set(tags.get(e["id"], [])) - own)
            sb.table("events").update({"communities": new, "communities_checked_at": now().isoformat()}).eq("id", e["id"]).execute()
            done += 1
            if verbose and new:
                print(f"  #{e['id']:5} {e['name'][:45]:45} + {', '.join(new)}")
    return done


def run(sb: Client, everything: bool = False, verbose: bool = False) -> tuple[int, int]:
    """Tags clubs, then events, that need it. Returns (clubs, events) tagged."""
    client = anthropic.Anthropic()
    return tag_clubs(sb, client, everything, verbose), tag_events(sb, client, everything, verbose)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Tag clubs and events with the communities they're for.")
    parser.add_argument("--all", action="store_true", help="tag every club and upcoming event again")
    args = parser.parse_args()
    from store import connect

    clubs, events = run(connect(), everything=args.all, verbose=True)
    print(f"{clubs} club(s) and {events} event(s) tagged")
    return 0


if __name__ == "__main__":
    sys.exit(main())
