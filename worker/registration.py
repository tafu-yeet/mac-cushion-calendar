"""Registration for each event: required, recommended, drop_in, or unknown.

Instagram comes first: what the club wrote wins over anything inferred. Claude
(CLAUDE_MODEL) reads the captions a batch of events at a time. An event with no
post of its own (from Rubric), or whose own caption says nothing, uses the
captions of its copies: Instagram posts of the same event that were rejected as
copies of it.

Rubric only makes registration required when its listing does: the description
says to register, the event is capped or sold out, or a ticket costs money. A
free ($0) ticket alone means nothing; many clubs use one as a headcount for
drop-in events. When the caption and Rubric disagree (the caption says drop in
but Rubric has a ticket), the caption wins and the event is flagged
(registration_conflict) for a person.

Each worker cycle judges upcoming events not judged yet, or whose caption or
Rubric listing changed since. A registration a person set is left alone, and a
flag a person dismissed stays dismissed.

Usage (from worker/):
    python registration.py                  list what would change
    python registration.py --apply          save it
    python registration.py --all --apply    judge every upcoming event again (backfill)
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

import anthropic
from pydantic import BaseModel, Field
from supabase import Client

from extractors import Usage
from extractors.claude import model_options
from rubric import fetch_all
from settings import CLAUDE_EFFORT, CLAUDE_MODEL

PER_CALL = 12
PAST_DAYS = 3        # events this recent still get judged (a launch-week test case may be yesterday's)
AHEAD_WEEKS = 8
UNCAPPED = 10000     # Rubric's maxTickets when a club sets no limit
COPY_NOTE = re.compile(r"copy of .*\(#(\d+)\)")
FLAG = "registration_conflict"

State = Literal["required", "recommended", "drop_in", "unknown"]
Where = Literal["rubric", "link_in_bio", "form", "qr_code", "at_the_door", "other"]

RULES = """For each campus event, read what its texts say about registering to attend.

registration:
- required: attendees must register, RSVP, sign up or get a ticket first. E.g. "RSVP required", "register to \
attend", "registration required", "limited spots, sign up", "spots are limited", "RSVP for location", "tickets \
required", "sign up using the form/QR code", "register now at the link in bio".
- recommended: registering is asked for but optional. E.g. "RSVP appreciated", "sign up so we know numbers", \
"register if you can", "let us know you're coming".
- drop_in: the text says people can just come. E.g. "drop in", "drop by", "come anytime", "no registration \
needed", "walk-ins welcome", "stop by".
- unknown: the text doesn't say. This is the default. Never infer drop_in from an event sounding casual, or \
required from it sounding popular; only the words count.
When one text says both, go by what it asks of attendees: "register so we have enough sets ... come drop by" is \
recommended (a headcount); "limited spots, sign up ... stop by our table" is required.

where (only for required or recommended, else null): rubric (the text names Rubric), link_in_bio ("link in bio" \
without naming where it goes), form (a Google Form or other form), qr_code (scan the QR code or barcode on the \
poster), at_the_door (pay or sign in at the door), other (email, DM, a website).
url: a registration link copied exactly from the text, or null. Never make one up.
quote: the words you decided from, copied from the text (at most 15 words), or null for unknown.

Each event has up to two texts, judged separately: "instagram" (the club's own post) and "copies" (other posts \
of the same event). Give a reading for each text that is present, null for one that isn't. Answer for every id."""


class Reading(BaseModel):
    registration: State
    where: Where | None = None
    url: str | None = None
    quote: str | None = Field(default=None, max_length=200)


class Judgment(BaseModel):
    id: int
    instagram: Reading | None = None
    copies: Reading | None = None


class Judgments(BaseModel):
    events: list[Judgment]


@dataclass
class Decision:
    registration: State
    where: str | None
    url: str | None
    note: str | None
    conflict: str | None  # why the sources disagree, if they do

    def row(self) -> dict:
        return {"registration": self.registration, "registration_where": self.where,
                "registration_url": self.url, "registration_note": self.note}


# Rubric ------------------------------------------------------------------------------

RUBRIC_REQUIRED = re.compile(
    r"\b(rsvp|registration|register|sign[ -]?up|tickets?)\b[^.!\n]{0,40}\b(required|needed|mandatory|must)\b"
    r"|\b(must|need to|have to|please) (rsvp|register|sign[ -]?up|get a ticket)\b"
    r"|\b(limited (spots|spaces?|seats|capacity|tickets)|spots? (are )?limited|max(imum)? capacity|capped at)\b",
    re.I,
)
RUBRIC_DROP_IN = re.compile(
    r"\b(drop[ -]in|drop by|come anytime|no (registration|rsvp|sign[ -]?up) (is )?(needed|required)|walk[ -]ins welcome|stop by)\b",
    re.I,
)
RUBRIC_RECOMMENDED = re.compile(r"\b(rsvp appreciated|so we know (numbers|how many)|register if you can)\b", re.I)


def rubric_facts(r: dict) -> list[str]:
    """What in a Rubric listing makes registration required: a paid ticket, a cap, sold out, or its words."""
    facts = []
    tickets = r.get("tickets") or []
    if any((t.get("amount") or 0) > 0 for t in tickets):
        facts.append("a paid ticket on Rubric")
    details = (r.get("detail") or {}).get("eventDetails") or {}
    if (r.get("detail") or {}).get("ticketStatus") == "Sold":
        facts.append("sold out on Rubric")
    cap = details.get("maxTickets")
    if isinstance(cap, int) and 0 < cap < UNCAPPED:
        facts.append(f"capped at {cap} on Rubric")
    if m := RUBRIC_REQUIRED.search(r.get("description") or ""):
        facts.append(f"Rubric says “{m.group(0)}”")
    return facts


def rubric_state(r: dict | None) -> tuple[State, list[str]]:
    if not r:
        return "unknown", []
    facts = rubric_facts(r)
    text = r.get("description") or ""
    if facts:
        return "required", facts
    if m := RUBRIC_DROP_IN.search(text):
        return "drop_in", [f"Rubric says “{m.group(0)}”"]
    if m := RUBRIC_RECOMMENDED.search(text):
        return "recommended", [f"Rubric says “{m.group(0)}”"]
    return "unknown", []


# Deciding ----------------------------------------------------------------------------

def decide(e: dict, own: Reading | None, copies: Reading | None, r: dict | None) -> Decision:
    """The event's registration from its readings and Rubric listing (see the module docstring)."""
    ig = own if own and own.registration != "unknown" else copies if copies and copies.registration != "unknown" else None
    r_state, facts = rubric_state(r)
    rubric_url = (r or {}).get("url") or e.get("ticket_url")

    if ig is None:
        if r_state == "unknown":
            return Decision("unknown", None, None, None, None)
        where = "rubric" if r_state in ("required", "recommended") else None
        return Decision(r_state, where, rubric_url if where else None, "; ".join(facts)[:300], None)

    where = ig.where if ig.registration in ("required", "recommended") else None
    if where == "link_in_bio" and r and r.get("tickets"):
        where = "rubric"  # the event takes registrations on Rubric, so that's where the bio link goes
    url = ig.url if ig.url and ig.url.startswith(("http://", "https://")) else None
    if where == "rubric" and not url:
        url = rubric_url
    note = f"“{ig.quote}”" if ig.quote else None

    conflict = None
    has_ticket = bool(r and r.get("tickets"))
    if ig.registration == "drop_in" and (r_state in ("required", "recommended") or has_ticket):
        conflict = "the post says drop in, but " + ("; ".join(facts) if facts else "Rubric has a free ticket")
    elif ig.registration in ("required", "recommended") and r_state == "drop_in":
        conflict = f"the post asks people to register, but {facts[0] if facts else 'Rubric says drop in'}"
    elif ig.registration == "recommended" and r_state == "required":
        conflict = "the post says registering is optional, but " + "; ".join(facts)
    return Decision(ig.registration, where, url[:500] if url else None, (note or "")[:300] or None, conflict)


# Reading -----------------------------------------------------------------------------

def event_text(e: dict, copies: list[str]) -> str:
    club = (e.get("clubs") or {}).get("name", "")
    parts = [f"### Event {e['id']}: {e['name']} ({club})"]
    caption = ((e.get("posts") or {}).get("caption") or "").strip()
    if caption:
        parts.append(f"instagram: {caption}")
    if copies:
        parts.append("copies: " + "\n---\n".join(copies))
    return "\n".join(parts)


def read(client: anthropic.Anthropic, events: list[dict], copies: dict[int, list[str]]) -> tuple[dict[int, Judgment], Usage]:
    listing = "\n\n".join(event_text(e, copies.get(e["id"], [])) for e in events)
    response = client.beta.messages.parse(
        model=CLAUDE_MODEL,
        max_tokens=16000,
        **model_options(CLAUDE_MODEL, CLAUDE_EFFORT),
        system=RULES,
        messages=[{"role": "user", "content": listing}],
        output_format=Judgments,
    )
    usage = Usage(model=response.model, stop_reason=response.stop_reason, input_tokens=response.usage.input_tokens,
                  output_tokens=response.usage.output_tokens)
    if response.parsed_output is None:
        raise RuntimeError(f"no answer (stop_reason: {response.stop_reason})")
    return {j.id: j for j in response.parsed_output.events}, usage


# Loading -----------------------------------------------------------------------------

COLUMNS = (
    "id, name, status, club_id, starts_at, post_id, rubric_eid, ticket_url, flags, reviewed_fields, "
    "registration, registration_where, registration_url, registration_note, registration_checked_at, "
    "posts(caption, caption_changed_at), clubs(name)"
)


def load(sb: Client, everything: bool, ids: list[int] | None = None) -> tuple[list[dict], dict[int, list[str]], dict[int, dict]]:
    """Events to judge (only `ids`, if given), their copies' captions, and their Rubric listings."""
    now = datetime.now(timezone.utc)
    lo, hi = (now - timedelta(days=PAST_DAYS)).isoformat(), (now + timedelta(weeks=AHEAD_WEEKS)).isoformat()
    events = fetch_all(lambda a, b: sb.table("events").select(COLUMNS).in_("status", ["pending", "approved"])
                       .gte("starts_at", lo).lt("starts_at", hi).range(a, b))
    if ids:
        events, everything = [e for e in events if e["id"] in ids], True
    eids = [e["rubric_eid"] for e in events if e["rubric_eid"]]
    rubric = {}
    for i in range(0, len(eids), 200):
        for r in sb.table("rubric_events").select("eid, url, tickets, description, detail, changed_at") \
                .in_("eid", eids[i:i + 200]).execute().data:
            rubric[r["eid"]] = r

    def stale(e: dict) -> bool:
        if "registration" in (e["reviewed_fields"] or []):
            return False
        checked = e["registration_checked_at"]
        if everything or not checked:
            return True
        changed = [(e.get("posts") or {}).get("caption_changed_at"), (rubric.get(e["rubric_eid"]) or {}).get("changed_at")]
        return any(c and c > checked for c in changed)

    todo = [e for e in events if stale(e)]
    copies: dict[int, list[str]] = {}
    rejected = fetch_all(lambda a, b: sb.table("events").select("review_notes, posts(caption)").eq("status", "rejected")
                         .gte("starts_at", lo).lt("starts_at", hi).not_.is_("post_id", "null").range(a, b))
    wanted = {e["id"] for e in todo}
    for c in rejected:
        caption = ((c.get("posts") or {}).get("caption") or "").strip()
        for note in c["review_notes"] or []:
            if (m := COPY_NOTE.search(note)) and int(m.group(1)) in wanted and caption:
                copies.setdefault(int(m.group(1)), []).append(caption)
    return todo, copies, rubric


def run(sb: Client, everything: bool = False, apply: bool = True, verbose: bool = False,
        ids: list[int] | None = None) -> list[tuple[dict, Decision]]:
    """Judge the events that need it; returns (event, decision) for each one judged."""
    todo, copies, rubric = load(sb, everything, ids)
    if not todo:
        return []
    from store import log_usage  # store imports the extractors; keep this module light for its own CLI

    client = anthropic.Anthropic()
    out = []
    for i in range(0, len(todo), PER_CALL):
        chunk = todo[i:i + PER_CALL]
        judgments, usage = read(client, chunk, copies)
        if apply:
            log_usage(sb, None, usage, "registration")
        for e in chunk:
            j = judgments.get(e["id"]) or Judgment(id=e["id"])
            d = decide(e, j.instagram, j.copies, rubric.get(e["rubric_eid"]))
            out.append((e, d))
            if verbose:
                print(f"  #{e['id']} {d.registration:<11} {d.where or '':<11} {e['name'][:45]}"
                      + (f"  [{d.note}]" if d.note else "") + (f"  CONFLICT: {d.conflict}" if d.conflict else ""))
            if apply:
                save(sb, e, d)
    return out


def save(sb: Client, e: dict, d: Decision) -> None:
    update = {k: v for k, v in d.row().items() if e.get(k) != v}
    update["registration_checked_at"] = datetime.now(timezone.utc).isoformat()
    flags = set(e["flags"] or [])
    dismissed = f"flag:{FLAG}" in (e["reviewed_fields"] or [])
    want = bool(d.conflict) and not dismissed
    if want and FLAG not in flags:
        update["flags"] = sorted(flags | {FLAG})
        notes = sb.table("events").select("review_notes").eq("id", e["id"]).single().execute().data["review_notes"] or []
        note = f"Registration: {d.conflict}. Using the post's “{d.registration.replace('_', ' ')}”."
        if note not in notes:
            update["review_notes"] = [*notes, note]
    elif not want and FLAG in flags:
        update["flags"] = sorted(flags - {FLAG})
    sb.table("events").update(update).eq("id", e["id"]).execute()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Decide events' registration (required, recommended, drop in, unknown).")
    parser.add_argument("--apply", action="store_true", help="save the decisions (otherwise just list them)")
    parser.add_argument("--all", action="store_true", help="judge every upcoming event again, not just new or changed ones")
    parser.add_argument("--ids", type=lambda s: [int(x) for x in s.split(",")], help="only these event ids, e.g. 793,303")
    args = parser.parse_args()
    from store import connect

    results = run(connect(), everything=args.all, apply=args.apply, verbose=True, ids=args.ids)
    counts: dict[str, int] = {}
    for _, d in results:
        counts[d.registration] = counts.get(d.registration, 0) + 1
    conflicts = sum(1 for _, d in results if d.conflict)
    print(f"{len(results)} event(s) judged: {counts}; {conflicts} flagged for a disagreement"
          + ("" if args.apply else " (not saved; add --apply)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
