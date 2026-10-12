"""Scores every active club out of 10 for outreach, from what the worker has collected,
and writes a spreadsheet ranked by who to message first.

The rubric (the user's): food events in the last 6 weeks (3+ = 3, 1-2 = 1),
open to everyone (2), event details in the feed rather than only in stories
(2), posted in the last 2 weeks (1), followers (1,000+ = 2, 300-999 = 1).
7+ = message first, 5-6 = second, under 5 = skip for now; anyone you know
goes to the top. The spreadsheet holds the evidence, and every score is a
formula on it, with the thresholds in their own cells on the Rubric tab.

Evidence comes from the database: AI-read events where we have them, and
keyword matches on captions of posts the AI didn't read (older than 7 days
when first fetched, or reels). Club types are sorted from club names by Haiku
once and cached in out/club_types.json.

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
from settings import CLAUDE_MODEL, LOCAL_TZ, WORKER_DIR
from store import connect

WINDOW_DAYS = 42  # the rubric's "last 6 weeks"
TYPES_CACHE = WORKER_DIR / "out" / "club_types.json"

# Food the club gives out, as worded in a caption; and wording that means it's not free.
FOOD = re.compile(
    r"\b(free food|pizza|snacks?|refreshments?|boba|bubble tea|coffee|donuts?|doughnuts?|bagels?|lunch|dinner|breakfast|"
    r"brunch|treats?|cookies?|cupcakes?|cake|samosas?|bbq|barbecue|potluck|catered|food|hot chocolate|s'?mores|popcorn|"
    r"candy|ice cream|chai|dessert|tacos?|wings|dumplings|biryani|sushi|ramen|noodles)\b",
    re.I,
)
NOT_FREE = re.compile(r"\b(food drive|food bank|bake sale|for sale|fundraiser)\b|\$\s?\d", re.I)
WELCOMING = re.compile(
    r"\b(all (are )?welcome|everyone (is )?welcome|open to (all|everyone|any)|no experience|drop[- ]in|free to attend|"
    r"no (sign[- ]?up|registration)|free entry|anyone can)\b",
    re.I,
)
MEMBERS_ONLY = re.compile(r"\b(members[- ]only|for (our )?members|exclusive to (our )?members|members get in)\b", re.I)
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
# Which types the rubric says usually score high, or to leave for later.
OUTLOOK = {
    "Cultural or regional": "Usually high", "Faculty or program society": "Usually high",
    "Religious or faith": "Usually high", "Food or cooking": "Usually high", "Service or social": "Usually high",
    "Hobby or interest": "", "Competitive or audition": "Leave for later",
    "Professional or case competition": "Leave for later", "Official or department": "", "Other": "",
}


class TypedClub(BaseModel):
    username: str
    type: ClubType


class TypedClubs(BaseModel):
    clubs: list[TypedClub]


def club_types(clubs: list[dict]) -> dict[str, str]:
    """username -> type, asking Haiku only about clubs not in the cache."""
    cached = json.loads(TYPES_CACHE.read_text(encoding="utf-8")) if TYPES_CACHE.exists() else {}
    missing = [c for c in clubs if c["instagram_username"] not in cached]
    client = anthropic.Anthropic()
    for i in range(0, len(missing), 80):
        batch = missing[i : i + 80]
        listing = "\n".join(f"@{c['instagram_username']}: {c['name']}" for c in batch)
        response = client.beta.messages.parse(
            model=CLAUDE_MODEL,
            max_tokens=6000,
            system=(
                "You sort McMaster University student groups by type from their Instagram name. "
                "Competitive or audition: sports teams, varsity, dance or music groups you try out for. "
                "Professional or case competition: consulting, finance, investing, business case and pre-professional "
                "career clubs. Official or department: university offices, faculties, departments, MSU services. "
                "Service or social: volunteering, charity, advocacy, and large general social clubs. "
                "Hobby or interest: games, arts, crafts, music, outdoors, and other interest clubs. "
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


def evidence(sb) -> list[dict]:
    clubs = sb.table("clubs").select("id, name, instagram_username, followers").eq("active", True).order("id").execute().data
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).isoformat()
    posts = fetch_all(lambda a, b: sb.table("posts").select("id, club_id, posted_at, caption, extraction_status").range(a, b))
    events = fetch_all(lambda a, b: (
        sb.table("events")
        .select("club_id, post_id, name, starts_at, start_time_known, location, has_free_food, open_to_all, status, reviewed_by, posts!inner(posted_at)")
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
        evs, ps = club_events[club["id"]], recent_posts[club["id"]]
        # Free-food events the AI found, one per event however many posts announced it.
        food_events: list[dict] = []
        for e in (e for e in evs if e["has_free_food"]):
            if not any((x["starts_at"] or "")[:10] == (e["starts_at"] or "")[:10] and similar_names(x["name"], e["name"]) for x in food_events):
                food_events.append(e)
        unread = [p for p in ps if p["extraction_status"] != "done" and p["caption"]]
        caption_food = sum(1 for p in unread if FOOD.search(p["caption"]) and not NOT_FREE.search(p["caption"]))

        captions = [p["caption"] or "" for p in ps]
        welcoming = sum(bool(WELCOMING.search(c)) for c in captions)
        members = sum(bool(MEMBERS_ONLY.search(c)) for c in captions)
        open_share = sum(bool(e["open_to_all"]) for e in evs) / len(evs) if evs else None
        if (open_share is not None and open_share >= 0.5) or welcoming > members:
            is_open = "Yes"
        elif (open_share is not None and open_share < 0.5) or members:
            is_open = "No"
        else:
            is_open = "Unclear"

        detailed_event = any(e["start_time_known"] and e["location"] for e in evs)
        detailed_caption = any(TIME.search(c) and DATE.search(c) for c in captions)
        details = "Yes" if detailed_event or detailed_caption else "No"

        last = datetime.fromisoformat(last_post[club["id"]]).astimezone(LOCAL_TZ).date() if club["id"] in last_post else None
        notes = [f"{len(food_events) + caption_food} food event(s)" + (f", {caption_food} from captions" if caption_food else "")]
        if evs:
            notes.append(f"{sum(bool(e['open_to_all']) for e in evs)} of {len(evs)} events open to all")
        notes.append(f"{len(ps)} post(s) in 6 weeks")
        rows.append({
            "name": club["name"], "username": club["instagram_username"], "followers": club["followers"],
            "food": len(food_events) + caption_food, "open": is_open, "details": details, "last_post": last,
            "notes": "; ".join(notes),
        })
    return rows


def python_score(r: dict, today: date) -> int:
    """The same rubric as the spreadsheet's formulas, for sorting and for checking them."""
    food = 3 if r["food"] >= 3 else 1 if r["food"] >= 1 else 0
    open_ = 2 if r["open"] == "Yes" else 0
    details = 2 if r["details"] == "Yes" else 0
    active = 1 if r["last_post"] and (today - r["last_post"]).days <= 14 else 0
    f = r["followers"]
    followers = 0 if f is None else 2 if f >= 1000 else 1 if f >= 300 else 0
    return food + open_ + details + active + followers


def write_workbook(rows: list[dict], path: str, today: date) -> None:
    from openpyxl import Workbook
    from openpyxl.formatting.rule import FormulaRule
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    font = Font(name="Arial", size=10)
    bold = Font(name="Arial", size=10, bold=True)
    header_font = Font(name="Arial", size=10, bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="7A1F3D")  # the brand maroon
    input_fill = PatternFill("solid", fgColor="FFFF00")  # cells for you to fill in
    wb = Workbook()

    # Rubric: every threshold and point value in its own cell, referenced by the formulas.
    rubric = wb.active
    rubric.title = "Rubric"
    rubric["A1"] = "Outreach rubric"
    rubric["A1"].font = Font(name="Arial", size=14, bold=True)
    rubric["A2"] = "Source: your club scoring rubric. Change a threshold or point value here and every score updates."
    rubric["A4"], rubric["B4"] = "Data as of", today
    rubric["B4"].number_format = "mmm d, yyyy"
    rubric["A5"], rubric["B5"], rubric["C5"] = "Criterion", "Threshold", "Points"
    lines = [
        ("Food events in 6 weeks: at least", 3, 3),
        ("Food events in 6 weeks: at least (lower tier)", 1, 1),
        ("Open to everyone", "Yes", 2),
        ("Event details in the feed", "Yes", 2),
        ("Active: posted within (days)", 14, 1),
        ("Followers: at least", 1000, 2),
        ("Followers: at least (lower tier)", 300, 1),
    ]
    for i, (label, threshold, points) in enumerate(lines, start=6):
        rubric[f"A{i}"], rubric[f"B{i}"], rubric[f"C{i}"] = label, threshold, points
    rubric["A14"], rubric["B14"] = "Message first at a score of at least", 7
    rubric["A15"], rubric["B15"] = "Message second at a score of at least", 5
    rubric["A17"], rubric["B17"] = "Club type", "Outlook (from your rubric)"
    for i, (club_type, outlook) in enumerate(OUTLOOK.items(), start=18):
        rubric[f"A{i}"], rubric[f"B{i}"] = club_type, outlook or "No guidance"
    types_end = 17 + len(OUTLOOK)
    for row in rubric.iter_rows(min_row=1, max_row=types_end):
        for cell in row:
            if cell.font != rubric["A1"].font:
                cell.font = font
    for cell in ("A5", "B5", "C5", "A17", "B17"):
        rubric[cell].font = bold
    rubric.column_dimensions["A"].width = 44
    rubric.column_dimensions["B"].width = 26
    rubric.column_dimensions["C"].width = 10

    # Clubs: evidence in columns D-J, scores as formulas in K-P, tier in R.
    sheet = wb.create_sheet("Clubs", 0)
    sheet["A1"] = "Club outreach scores"
    sheet["A1"].font = Font(name="Arial", size=14, bold=True)
    sheet["A2"] = (
        "Fill in the yellow columns: type yes under “Know someone?” to move a club to the top (e.g. yes), "
        "and mark “Messaged?” as you go. Scores are formulas on the evidence; thresholds are on the Rubric tab."
    )
    sheet["A2"].font = font
    headers = [
        "Rank", "Club", "Instagram", "Type", "Type outlook", "Food events (6 wk)", "Open to everyone",
        "Details in feed", "Last post", "Followers", "Food pts", "Open pts", "Details pts", "Active pts",
        "Followers pts", "Score", "Know someone?", "Tier", "Messaged?", "Evidence",
    ]
    for col, title in enumerate(headers, start=1):
        cell = sheet.cell(row=4, column=col, value=title)
        cell.font, cell.fill = header_font, header_fill
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    first, last = 5, 4 + len(rows)
    types_range = f"Rubric!$A$18:$A${types_end}"
    outlook_range = f"Rubric!$B$18:$B${types_end}"
    for i, r in enumerate(rows):
        n = first + i
        values = {
            "A": f"=RANK(P{n},$P${first}:$P${last})",
            "B": r["name"],
            "C": f"@{r['username']}",
            "D": r["type"],
            "E": f'=IFERROR(INDEX({outlook_range},MATCH(D{n},{types_range},0)),"")',
            "F": r["food"],
            "G": r["open"],
            "H": r["details"],
            "I": r["last_post"],
            "J": r["followers"],
            "K": f"=IF(F{n}>=Rubric!$B$6,Rubric!$C$6,IF(F{n}>=Rubric!$B$7,Rubric!$C$7,0))",
            "L": f"=IF(G{n}=Rubric!$B$8,Rubric!$C$8,0)",
            "M": f"=IF(H{n}=Rubric!$B$9,Rubric!$C$9,0)",
            "N": f'=IF(I{n}="",0,IF(Rubric!$B$4-I{n}<=Rubric!$B$10,Rubric!$C$10,0))',
            "O": f'=IF(J{n}="",0,IF(J{n}>=Rubric!$B$11,Rubric!$C$11,IF(J{n}>=Rubric!$B$12,Rubric!$C$12,0)))',
            "P": f"=SUM(K{n}:O{n})",
            "Q": None,
            "R": f'=IF(LOWER(TRIM(Q{n}))="yes","Message first (you know someone)",IF(P{n}>=Rubric!$B$14,"Message first",IF(P{n}>=Rubric!$B$15,"Message second","Skip for now")))',
            "S": None,
            "T": r["notes"],
        }
        for col, value in values.items():
            cell = sheet[f"{col}{n}"]
            cell.value = value
            cell.font = font
        sheet[f"C{n}"].hyperlink = f"https://www.instagram.com/{r['username']}/"
        sheet[f"C{n}"].font = Font(name="Arial", size=10, color="0563C1", underline="single")
        sheet[f"I{n}"].number_format = "mmm d, yyyy"
        sheet[f"J{n}"].number_format = "#,##0"
        sheet[f"Q{n}"].fill = input_fill
        sheet[f"S{n}"].fill = input_fill
    green = PatternFill("solid", fgColor="D9EAD3")
    amber = PatternFill("solid", fgColor="FFF2CC")
    sheet.conditional_formatting.add(f"R{first}:R{last}", FormulaRule(formula=[f'LEFT(R{first},13)="Message first"'], fill=green))
    sheet.conditional_formatting.add(f"R{first}:R{last}", FormulaRule(formula=[f'R{first}="Message second"'], fill=amber))
    widths = {"A": 6, "B": 34, "C": 24, "D": 26, "E": 15, "F": 11, "G": 11, "H": 10, "I": 13, "J": 11,
              "K": 7, "L": 7, "M": 8, "N": 7, "O": 9, "P": 7, "Q": 11, "R": 30, "S": 11, "T": 60}
    for col, width in widths.items():
        sheet.column_dimensions[col].width = width
    sheet.row_dimensions[4].height = 30
    sheet.freeze_panes = "C5"
    sheet.auto_filter.ref = f"A4:{get_column_letter(len(headers))}{last}"

    # How it's scored: where each piece of evidence comes from, and its limits.
    notes = wb.create_sheet("How it's scored")
    lines = [
        ("How each column is found", True),
        (f"Window: posts from the {WINDOW_DAYS} days before {today:%b %d, %Y}.", False),
        ("Food events: free-food events the AI read from posts (one per event, however many posts announced it), plus "
         "posts the AI didn't read (first seen when already over a week old, or reels) whose caption names food and "
         "doesn't mention a price, food drive, bake sale or fundraiser. Caption matches are estimates.", False),
        ("Open to everyone: Yes when at least half the club's AI-read events are open to all, or more captions say "
         "'all welcome', 'drop-in', 'no experience' and the like than say 'members only'. Unclear counts as 0.", False),
        ("Details in feed: Yes when an AI-read event had its time and place in the post, or a caption gives a time "
         "and a day or date. Stories aren't visible to us, so a club that posts details only in stories scores No.", False),
        ("Last post: the newest post we've stored from the club, reels included.", False),
        ("Followers: read from the club's Instagram profile page on the date above.", False),
        ("Type: sorted from the club's name by an AI model, for the rubric's 'usually high' and 'leave for later' "
         "guidance. It doesn't change the score; check it when deciding between similar scores.", False),
        ("Tier: 7+ message first, 5-6 second, under 5 skip for now; 'yes' under Know someone? goes to the top "
         "whatever the score, as your rubric says.", False),
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
        r["type"] = types.get(r["username"], "Other")
        r["score"] = python_score(r, today)
    rows.sort(key=lambda r: (-r["score"], -(r["followers"] or 0), r["name"].lower()))
    write_workbook(rows, out, today)
    tiers = [("Message first", sum(r["score"] >= 7 for r in rows)), ("Message second", sum(5 <= r["score"] < 7 for r in rows)),
             ("Skip for now", sum(r["score"] < 5 for r in rows))]
    print(f"{len(rows)} clubs scored -> {out}")
    print(", ".join(f"{name}: {n}" for name, n in tiers))
    print(f"no follower count yet: {sum(r['followers'] is None for r in rows)}")
    json.dump([{k: (v.isoformat() if isinstance(v, date) else v) for k, v in r.items()} for r in rows],
              open(WORKER_DIR / "out" / "club_scores.json", "w", encoding="utf-8"), indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
