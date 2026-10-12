"""Ranks clubs for outreach from what the worker has collected, and writes a
spreadsheet: hubs to approach first, the top clubs to message, and the rest.

Score out of 10, built from the user's rubric:
- free-food events in the last 6 weeks: 3+ = 3, 1-2 = 2 (the site's hook,
  and rare: most clubs have none);
- events of any kind in the last 6 weeks: 4+ = 2, 1-3 = 1 (the site lists
  every event now);
- followers: 1,500+ = 3, 700-1,499 = 2, 300-699 = 1 (reach, for sharing Cushion);
- open to everyone, or nothing saying it's members-only = 1;
- posted in the last 2 weeks = 1.
The rubric's "details in the feed" isn't scored: clubs that post details in
the feed are the ones the site already picks up, so it said little about
who's worth contacting, and it overlapped with "active" and "open".

Tracks, before ranking:
- Hub: one yes reaches many clubs or students (MSU-wide accounts and faculty
  societies), approached first, outside the club ranking;
- Office: university offices and MSU services, which aren't clubs;
- Later: the types the rubric says to leave for later (competitive or
  audition-based, professional or case competition);
- Club: everyone else, ranked; the top N (40) are the first wave.
Anyone you know goes to the top whatever their score.

The spreadsheet holds the evidence, and every score, track, rank and tier is
a formula on it, with thresholds and point values on the Rubric tab. Evidence
comes from AI-read events where we have them, and from captions of posts the
AI didn't read (older than 7 days when first fetched, or reels). Club types
are sorted from club names by Sonnet once and cached in out/club_types.json
(delete it to sort again).

Usage (from worker/; needs openpyxl, which the scheduled worker doesn't):
    python club_scores.py [output.xlsx]
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import anthropic
from pydantic import BaseModel

from auto_approve import similar_names
from settings import LOCAL_TZ, VERIFY_MODEL, WORKER_DIR
from store import connect

WINDOW_DAYS = 42  # the rubric's "last 6 weeks"
TOP_N = 40
TYPES_CACHE = WORKER_DIR / "out" / "club_types.json"

# One yes from these reaches many clubs or students: the MSU-wide accounts (the
# Clubs Department reaches every club; First Year Council, the audience), Mac
# Club Hub (which promotes clubs), and the faculty societies.
HUBS = {
    "msu_mcmaster", "msuclubs", "msucampusevents", "msu_fyc", "macclubhub",
    "macsci", "macengsociety", "macsocsci", "machumsociety", "dcsatmac", "macnursingsociety", "macbhss",
}

# Food the club gives out, as worded in a caption; and wording that means it's not free.
FOOD = re.compile(
    r"\b(free food|pizza|snacks?|refreshments?|boba|bubble tea|coffee|donuts?|doughnuts?|bagels?|lunch|dinner|breakfast|"
    r"brunch|treats?|cookies?|cupcakes?|cake|samosas?|bbq|barbecue|potluck|catered|food|hot chocolate|s'?mores|popcorn|"
    r"candy|ice cream|chai|dessert|tacos?|dumplings|biryani|sushi|ramen|noodles)\b",
    re.I,
)
NOT_FREE = re.compile(
    r"\b(food drive|food bank|food insecurity|food trucks?|sale|selling|fundraiser|fundraising|proceeds|donations?|all funds)\b|\$\s?\d", re.I
)
# Food that's offered, rather than a passing mention ("good food and memories").
OFFERED = re.compile(r"\b(free|provided|complimentary|served|on us)\b", re.I)
REMINDER_DAYS = 3  # food posts from one club this close together are taken as reminders for one event
MEMBERS_ONLY = re.compile(r"\b(members[- ]only|for (our )?members|exclusive to (our )?members|members get in)\b", re.I)
# A caption that gives a time and a day or date is announcing something.
TIME = re.compile(r"\b\d{1,2}(:\d{2})?\s?(am|pm)\b", re.I)
DATE = re.compile(
    r"\b(mon|tues?|wed|thur?s?|fri|sat|sun)(day)?\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b",
    re.I,
)

ClubType = Literal[
    "Cultural or regional", "Faculty or program society", "Religious or faith", "Food or cooking",
    "Service or social", "Hobby or interest", "Competitive or audition", "Professional or case competition",
    "Official or department", "Other",
]
# The rubric's guidance by type; "Later" and "Office" also set a club's track.
OUTLOOK = {
    "Cultural or regional": "Usually high", "Faculty or program society": "Usually high",
    "Religious or faith": "Usually high", "Food or cooking": "Usually high", "Service or social": "Usually high",
    "Hobby or interest": "No guidance", "Competitive or audition": "Leave for later",
    "Professional or case competition": "Leave for later", "Official or department": "Office or service",
    "Other": "No guidance",
}
# Where a club's own posts showed the name-based type was wrong (checked 2026-10-12).
TYPE_FIXES = {
    "mcmasterpulse": "Official or department",  # the athletic centre's fitness classes
    "som.mcmaster": "Hobby or interest",  # casual jams and music lessons, no auditions
    "acemcmaster": "Competitive or audition",  # accepts delegates by application
}


class TypedClub(BaseModel):
    username: str
    type: ClubType


class TypedClubs(BaseModel):
    clubs: list[TypedClub]


def club_types(clubs: list[dict]) -> dict[str, str]:
    """username -> type, asking Sonnet only about clubs not in the cache."""
    cached = json.loads(TYPES_CACHE.read_text(encoding="utf-8")) if TYPES_CACHE.exists() else {}
    missing = [c for c in clubs if c["instagram_username"] not in cached]
    client = anthropic.Anthropic()
    for i in range(0, len(missing), 80):
        batch = missing[i : i + 80]
        listing = "\n".join(f"@{c['instagram_username']}: {c['name']}" for c in batch)
        response = client.beta.messages.parse(
            model=VERIFY_MODEL,
            max_tokens=8000,
            system=(
                "You sort McMaster University student groups by type from their Instagram name. "
                "Faculty or program society: student-run societies, associations and collectives for a faculty, "
                "program, department, school or residence college (e.g. a Society of X Students, an X Student "
                "Association, an Economics Society, an MBA Association), and their committees. "
                "Official or department: accounts run by university or MSU staff, such as offices, student services, "
                "libraries, a faculty's or department's own account (e.g. 'Humanities at McMaster', 'Eng Phys at "
                "McMaster'), Athletics and Recreation programs such as intramurals, and MSU services. "
                "Competitive or audition: varsity and club sports teams, competition teams (e.g. design or debate), "
                "and dance, music or theatre groups you try out for. "
                "Professional or case competition: clubs for business, consulting, finance, investing and other "
                "career paths, and case-competition clubs; a society for an academic program is not this. "
                "Service or social: volunteering, charity, advocacy, health awareness, and general social clubs. "
                "Hobby or interest: games, arts, crafts, music, outdoors, fitness, and other interest clubs. "
                "Return every club, using its username exactly as given."
            ),
            messages=[{"role": "user", "content": listing}],
            output_format=TypedClubs,
        )
        for typed in response.parsed_output.clubs:
            cached[typed.username.lstrip("@")] = typed.type
    TYPES_CACHE.parent.mkdir(exist_ok=True)
    TYPES_CACHE.write_text(json.dumps(cached, indent=1, sort_keys=True), encoding="utf-8")
    return cached


def fetch_all(query_for_range) -> list[dict]:
    """Every row of a query, a page of 1,000 at a time."""
    rows, start = [], 0
    while True:
        page = query_for_range(start, start + 999).execute().data
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def distinct(events: list[dict]) -> list[dict]:
    """One per event, however many posts announced it: same day and a similar name."""
    kept: list[dict] = []
    for e in events:
        if not any((k["starts_at"] or "")[:10] == (e["starts_at"] or "")[:10] and similar_names(k["name"], e["name"]) for k in kept):
            kept.append(e)
    return kept


def one_per_event(posts: list[dict]) -> list[dict]:
    """Drops posts that follow a kept one within REMINDER_DAYS: likely reminders for the same event."""
    kept: list[dict] = []
    for p in sorted(posts, key=lambda p: p["posted_at"]):
        if not kept or datetime.fromisoformat(p["posted_at"]) - datetime.fromisoformat(kept[-1]["posted_at"]) > timedelta(days=REMINDER_DAYS):
            kept.append(p)
    return kept


def evidence(sb) -> list[dict]:
    clubs = sb.table("clubs").select("id, name, instagram_username, followers").eq("active", True).order("id").execute().data
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).isoformat()
    posts = fetch_all(lambda a, b: sb.table("posts").select("id, club_id, posted_at, caption, extraction_status").range(a, b))
    events = fetch_all(lambda a, b: (
        sb.table("events")
        .select("club_id, name, starts_at, has_free_food, open_to_all, status, reviewed_by, posts!inner(posted_at)")
        .gte("posts.posted_at", cutoff).range(a, b)
    ))

    last_post: dict[int, str] = {}
    recent_posts = defaultdict(list)
    for p in posts:
        last_post[p["club_id"]] = max(last_post.get(p["club_id"], ""), p["posted_at"])
        if p["posted_at"] >= cutoff:
            recent_posts[p["club_id"]].append(p)
    club_events = defaultdict(list)
    for e in events:
        if not (e["status"] == "rejected" and e["reviewed_by"]):  # a person said it wasn't right
            club_events[e["club_id"]].append(e)

    rows = []
    for club in clubs:
        evs, ps = distinct(club_events[club["id"]]), recent_posts[club["id"]]
        unread = [p for p in ps if p["extraction_status"] != "done" and p["caption"]]
        caption_events = [p for p in unread if TIME.search(p["caption"]) and DATE.search(p["caption"])]
        caption_food = one_per_event([
            p for p in unread
            if FOOD.search(p["caption"]) and not NOT_FREE.search(p["caption"])
            and (OFFERED.search(p["caption"]) or TIME.search(p["caption"]) or DATE.search(p["caption"]))
        ])
        food = sum(e["has_free_food"] for e in evs) + len(caption_food)
        n_events = len(evs) + len(caption_events)

        members_only = sum(bool(MEMBERS_ONLY.search(p["caption"] or "")) for p in ps)
        open_share = sum(bool(e["open_to_all"]) for e in evs) / len(evs) if evs else None
        if open_share is not None:
            is_open = "Yes" if open_share >= 0.5 else "No"
        else:
            is_open = "No" if members_only else "Unclear"

        last = datetime.fromisoformat(last_post[club["id"]]).astimezone(LOCAL_TZ).date() if club["id"] in last_post else None
        notes = [
            f"{food} food event(s)" + (f" ({len(caption_food)} from captions)" if caption_food else ""),
            f"{n_events} event(s)" + (f" ({len(caption_events)} from captions)" if caption_events else ""),
        ]
        if evs:
            notes.append(f"{sum(bool(e['open_to_all']) for e in evs)} of {len(evs)} read events open to all")
        notes.append(f"{len(ps)} post(s) in 6 weeks")
        rows.append({
            "name": club["name"], "username": club["instagram_username"], "followers": club["followers"],
            "food": food, "events": n_events, "open": is_open, "last_post": last,
            "hub": club["instagram_username"] in HUBS, "notes": "; ".join(notes),
        })
    return rows


def python_score(r: dict, today: date) -> int:
    """The same rubric as the spreadsheet's formulas, for sorting and for checking them."""
    food = 3 if r["food"] >= 3 else 2 if r["food"] >= 1 else 0
    events = 2 if r["events"] >= 4 else 1 if r["events"] >= 1 else 0
    f = r["followers"] or 0
    followers = 3 if f >= 1500 else 2 if f >= 700 else 1 if f >= 300 else 0
    open_ = 1 if r["open"] in ("Yes", "Unclear") else 0
    active = 1 if r["last_post"] and (today - r["last_post"]).days <= 14 else 0
    return food + events + followers + open_ + active


def track(r: dict) -> str:
    if r["hub"]:
        return "Hub"
    outlook = OUTLOOK.get(r["type"], "No guidance")
    return {"Office or service": "Office", "Leave for later": "Later"}.get(outlook, "Club")


def write_workbook(rows: list[dict], path: str, today: date) -> None:
    from openpyxl import Workbook
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    font = Font(name="Arial", size=10)
    bold = Font(name="Arial", size=10, bold=True)
    title = Font(name="Arial", size=14, bold=True)
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="7A1F3D")  # the brand maroon
    input_fill = PatternFill("solid", fgColor="FFFF00")  # cells for you to fill in or change
    wb = Workbook()

    # Rubric: every threshold and point value in its own cell, referenced by the formulas.
    rubric = wb.active
    rubric.title = "Rubric"
    rubric["A1"] = "Outreach rubric"
    rubric["A2"] = ("Built from your club scoring rubric (see the How it's scored tab for what changed and why). "
                    "Change a threshold, point value or the list size here and everything updates.")
    rubric["A4"], rubric["B4"] = "Data as of", today
    rubric["B4"].number_format = "mmm d, yyyy"
    rubric["A5"], rubric["B5"] = "Size of the first wave of clubs", TOP_N
    rubric["A6"], rubric["B6"] = "Next up at a score of at least", 6
    rubric["A8"], rubric["B8"], rubric["C8"] = "Criterion", "Threshold", "Points"
    lines = [
        ("Free-food events in 6 weeks: at least", 3, 3),  # row 9
        ("Free-food events in 6 weeks: at least (lower tier)", 1, 2),  # 10
        ("Events of any kind in 6 weeks: at least", 4, 2),  # 11
        ("Events of any kind in 6 weeks: at least (lower tier)", 1, 1),  # 12
        ("Followers: at least", 1500, 3),  # 13
        ("Followers: at least (middle tier)", 700, 2),  # 14
        ("Followers: at least (lower tier)", 300, 1),  # 15
        ("Open to everyone (Yes, or Unclear: nothing says members-only)", "No", 1),  # 16: points unless "No"
        ("Active: posted within (days)", 14, 1),  # 17
    ]
    for i, (label, threshold, points) in enumerate(lines, start=9):
        rubric[f"A{i}"], rubric[f"B{i}"], rubric[f"C{i}"] = label, threshold, points
    rubric["A19"], rubric["B19"] = "Club type", "Outlook (from your rubric)"
    for i, (club_type, outlook) in enumerate(OUTLOOK.items(), start=20):
        rubric[f"A{i}"], rubric[f"B{i}"] = club_type, outlook
    types_end = 19 + len(OUTLOOK)
    for row in rubric.iter_rows(min_row=2, max_row=types_end):
        for cell in row:
            cell.font = font
    rubric["A1"].font = title
    for cell in ("A8", "B8", "C8", "A19", "B19"):
        rubric[cell].font = bold
    for cell in ("B5", "B6"):
        rubric[cell].fill = input_fill
    rubric.column_dimensions["A"].width = 60
    rubric.column_dimensions["B"].width = 26
    rubric.column_dimensions["C"].width = 10

    # Clubs: evidence in D-K, points in L-P, score Q, track R, rank S, tier U.
    sheet = wb.create_sheet("Clubs", 0)
    sheet["A1"] = "Club outreach"
    sheet["A1"].font = title
    sheet["A2"] = (
        "Fill in the yellow columns: type yes under “Know someone?” to move a club to the top (e.g. yes), "
        "change “Hub?” if you disagree with a hub, and mark “Messaged?” as you go. "
        "Everything else is a formula on the evidence; thresholds and the list size are on the Rubric tab."
    )
    sheet["A2"].font = font
    headers = [
        "Order", "Club", "Instagram", "Type", "Hub?", "Food events (6 wk)", "Events (6 wk)", "Open to everyone",
        "Last post", "Followers", "Followers (number)", "Food pts", "Events pts", "Followers pts", "Open pts",
        "Active pts", "Score", "Track", "Club rank", "Know someone?", "Tier", "Messaged?", "Evidence",
    ]
    for col, header in enumerate(headers, start=1):
        cell = sheet.cell(row=4, column=col, value=header)
        cell.font, cell.fill = header_font, header_fill
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    first, last = 5, 4 + len(rows)
    types, outlooks = f"Rubric!$A$20:$A${types_end}", f"Rubric!$B$20:$B${types_end}"
    for i, r in enumerate(rows):
        n = first + i
        values = {
            "A": i + 1,
            "B": r["name"],
            "C": f"@{r['username']}",
            "D": r["type"],
            "E": "Yes" if r["hub"] else "",
            "F": r["food"],
            "G": r["events"],
            "H": r["open"],
            "I": r["last_post"],
            "J": r["followers"],
            "K": f'=IF(J{n}="",0,J{n})',
            "L": f"=IF(F{n}>=Rubric!$B$9,Rubric!$C$9,IF(F{n}>=Rubric!$B$10,Rubric!$C$10,0))",
            "M": f"=IF(G{n}>=Rubric!$B$11,Rubric!$C$11,IF(G{n}>=Rubric!$B$12,Rubric!$C$12,0))",
            "N": f"=IF(K{n}>=Rubric!$B$13,Rubric!$C$13,IF(K{n}>=Rubric!$B$14,Rubric!$C$14,IF(K{n}>=Rubric!$B$15,Rubric!$C$15,0)))",
            "O": f"=IF(H{n}=Rubric!$B$16,0,Rubric!$C$16)",
            "P": f'=IF(I{n}="",0,IF(Rubric!$B$4-I{n}<=Rubric!$B$17,Rubric!$C$17,0))',
            "Q": f"=SUM(L{n}:P{n})",
            "R": (f'=IF(LOWER(TRIM(E{n}))="yes","Hub",IF(IFERROR(INDEX({outlooks},MATCH(D{n},{types},0)),"")="Office or service","Office",'
                  f'IF(IFERROR(INDEX({outlooks},MATCH(D{n},{types},0)),"")="Leave for later","Later","Club")))'),
            "S": (f'=IF(R{n}="Club",1+COUNTIFS($R${first}:$R${last},"Club",$Q${first}:$Q${last},">"&Q{n})'
                  f'+COUNTIFS($R${first}:$R${last},"Club",$Q${first}:$Q${last},Q{n},$K${first}:$K${last},">"&K{n}),"")'),
            "T": None,
            "U": (f'=IF(LOWER(TRIM(T{n}))="yes","Message first (you know someone)",IF(R{n}="Hub","Hub: approach first",'
                  f'IF(R{n}="Office","Office or service: later",IF(R{n}="Later","Later (type)",'
                  f'IF(S{n}<=Rubric!$B$5,"First wave",IF(Q{n}>=Rubric!$B$6,"Next up","Skip for now"))))))'),
            "V": None,
            "W": r["notes"],
        }
        for col, value in values.items():
            cell = sheet[f"{col}{n}"]
            cell.value = value
            cell.font = font
        sheet[f"C{n}"].hyperlink = f"https://www.instagram.com/{r['username']}/"
        sheet[f"C{n}"].font = Font(name="Arial", size=10, color="0563C1", underline="single")
        sheet[f"I{n}"].number_format = "mmm d, yyyy"
        for col in ("J", "K"):
            sheet[f"{col}{n}"].number_format = "#,##0"
        for col in ("E", "T", "V"):
            sheet[f"{col}{n}"].fill = input_fill
    green, blue, amber = (PatternFill("solid", fgColor=c) for c in ("D9EAD3", "CFE2F3", "FFF2CC"))
    rng = f"U{first}:U{last}"
    sheet.conditional_formatting.add(rng, FormulaRule(formula=[f'OR(U{first}="First wave",LEFT(U{first},13)="Message first")'], fill=green))
    sheet.conditional_formatting.add(rng, FormulaRule(formula=[f'U{first}="Hub: approach first"'], fill=blue))
    sheet.conditional_formatting.add(rng, FormulaRule(formula=[f'U{first}="Next up"'], fill=amber))
    widths = {"A": 6, "B": 34, "C": 24, "D": 24, "E": 6, "F": 9, "G": 8, "H": 10, "I": 12, "J": 10, "K": 10,
              "L": 6, "M": 7, "N": 9, "O": 6, "P": 7, "Q": 6, "R": 8, "S": 6, "T": 10, "U": 24, "V": 10, "W": 60}
    for col, width in widths.items():
        sheet.column_dimensions[col].width = width
    sheet.column_dimensions["K"].hidden = True  # a helper: followers with blanks as 0, for the formulas
    sheet.row_dimensions[4].height = 42
    sheet.freeze_panes = "C5"
    sheet.auto_filter.ref = f"A4:{get_column_letter(len(headers))}{last}"

    # How it's scored: what changed from the original rubric, and where the evidence comes from.
    notes = wb.create_sheet("How it's scored")
    lines = [
        ("What changed from your rubric, and why", True),
        ("Event details in the feed is no longer scored. Clubs that post details in the feed are the ones the site "
         "already picks up, so it says little about who's worth contacting, and in the top 40 nearly every club had it.", False),
        ("Events of any kind count (up to 2 points), since the site lists every event now, not only free food.", False),
        ("Free food: 1-2 events now earns 2 points (was 1), because most clubs have none, so any food sets a club apart.", False),
        ("Followers have a third tier (1,500+ = 3) so the largest audiences rank above merely large ones.", False),
        ("Open to everyone earns 1 point unless the club's events are mostly limited or captions say members-only; "
         "no information no longer costs points.", False),
        ("Hubs (MSU-wide accounts and faculty societies) and offices are taken out of the club ranking: a hub reaches "
         "many clubs or students at once, so approach those first; offices and services aren't clubs.", False),
        ("The types your rubric says to leave for later (competitive or audition-based, professional or case "
         "competition) are kept out of the first wave, whatever their score.", False),
        ("", False),
        ("Where the evidence comes from", True),
        (f"Window: posts from the {WINDOW_DAYS} days before {today:%b %d, %Y}.", False),
        ("Free-food events and events: events the AI read from posts (one per event, however many posts announced "
         "it), plus posts the AI didn't read (first seen when already over a week old, or reels). A caption naming "
         "food that's free, provided or served, or giving a time or day, counts as a food event, unless it mentions a "
         "price, sale, fundraiser, donations, food trucks or a food drive; food posts from one club within "
         f"{REMINDER_DAYS} days count once, as reminders. A caption giving a time and a day or date counts as an "
         "event. Caption matches are estimates: in a sample of 30, about 4 in 5 were real free food.", False),
        ("Open to everyone: Yes when at least half the club's read events are open to all; No when most aren't or "
         "captions say members-only; Unclear when there's nothing to go on.", False),
        ("Last post: the newest post we've stored from the club, reels included.", False),
        ("Followers: read from the club's Instagram profile page; blank when it couldn't be read.", False),
        ("Type: sorted from the club's name by an AI model; it decides the Office and Later tracks, so check it, "
         "and change the club's row to Hub? yes, or Know someone? yes, if it's wrong for a club you care about.", False),
        ("Club rank: position among the Club track by score, then followers. The first wave is the top N on the "
         "Rubric tab; ties at the cut can make it a little longer.", False),
    ]
    for i, (text, is_heading) in enumerate(lines, start=1):
        cell = notes[f"A{i}"]
        cell.value = text
        cell.font = Font(name="Arial", size=12 if is_heading else 10, bold=is_heading)
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    notes.column_dimensions["A"].width = 110
    wb.save(path)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    out = sys.argv[1] if len(sys.argv) > 1 else str(WORKER_DIR.parent / "club_outreach.xlsx")
    sb = connect()
    today = datetime.now(LOCAL_TZ).date()
    rows = evidence(sb)
    clubs = sb.table("clubs").select("name, instagram_username").eq("active", True).execute().data
    types = club_types(clubs)
    for r in rows:
        r["type"] = TYPE_FIXES.get(r["username"]) or types.get(r["username"], "Other")
        r["score"] = python_score(r, today)
        r["track"] = track(r)
    order = {"Hub": 0, "Club": 1, "Office": 2, "Later": 3}
    rows.sort(key=lambda r: (order[r["track"]], -r["score"], -(r["followers"] or 0), r["name"].lower()))
    clubs_ranked = [r for r in rows if r["track"] == "Club"]
    for r in clubs_ranked:
        r["rank"] = 1 + sum(o["score"] > r["score"] or (o["score"] == r["score"] and (o["followers"] or 0) > (r["followers"] or 0)) for o in clubs_ranked)
    write_workbook(rows, out, today)
    print(f"{len(rows)} clubs -> {out}")
    print({t: sum(r["track"] == t for r in rows) for t in order}, "| first wave:", sum(r.get("rank", 99999) <= TOP_N for r in rows))
    print(f"no follower count yet: {sum(r['followers'] is None for r in rows)}")
    json.dump([{k: (v.isoformat() if isinstance(v, date) else v) for k, v in r.items()} for r in rows],
              open(WORKER_DIR / "out" / "club_scores.json", "w", encoding="utf-8"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
