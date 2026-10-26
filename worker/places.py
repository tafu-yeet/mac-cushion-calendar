"""Whether two events are in the same place, for telling copies of one event from
different events (auto_approve.py, merge.py).

Where and when give a copy away better than its name: two posts about one event
can be titled "Ala Bab El Cima" and "McMasr x NASA Movie Night", while two
clubs' "Halloween Social"s in different buildings are two events. Only a room
is precise enough to go on: a lounge, an atrium or a club space hosts several
events at once, so the same building alone proves nothing.

Unlike extractors/two_stage.same_place (two readings of one post, where a
missing or vague place never disagrees), this says when it can't tell.
"""

from __future__ import annotations

import re
import unicodedata

from extractors.two_stage import GENERIC_PLACE_WORDS
from settings import CAMPUS

CODES = {code.lower(): full for code, full in CAMPUS["campusLocations"].items()}
# Words that describe a building rather than name it: "Engineering Technology Building" and
# "H.G. Thode Library of Science and Engineering" are different buildings.
DESCRIPTIVE = {
    "science", "sciences", "engineering", "technology", "information", "student", "students", "health",
    "athletic", "learning", "discovery", "living", "memorial", "for", "great", "main", "space", "table",
    "near", "outside", "inside", "by", "between", "upstairs", "downstairs", "basement", "level",
}
# No place to compare: not announced yet, or online (Rubric shows "Online Event" when a club leaves it blank).
NO_PLACE = re.compile(r"^\W*(tba|tbd|tbc|to be (announced|confirmed|determined)|location (tba|tbd)|"
                      r"dm for (location|address)|see (bio|link))\W*$", re.I)
ONLINE = re.compile(r"\b(online|virtual|zoom|teams|discord|webinar|livestream)\b", re.I)
ADDRESS = re.compile(r"\b\d+\s+(?:[a-z.'-]+\s+){0,3}?(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|way|"
                     r"cres|crescent|lane|ln|pkwy|parkway|ct|court|hwy|highway|line|sideroad)\b\.?", re.I)
# A city after the place (", Hamilton ON"), not a building named after one ("Hamilton Hall").
CITY = re.compile(r",\s*(hamilton|toronto|mississauga|burlington|oakville|dundas|ancaster)\b\s*(,?\s*(on|ontario)\b.*)?$", re.I)
POSTAL = re.compile(r"\b[a-z]\d[a-z]\s?\d[a-z]\d\b", re.I)
ORDINAL = re.compile(r"^\d+(st|nd|rd|th)$")  # "3rd floor" isn't room 3


def expand_codes(location: str) -> str:
    """"MUSC 230" -> "MUSC 230 McMaster University Student Centre", so codes and full names compare;
    accents and apostrophes go, so "Bridges Café" and "Bridge's Cafe" are one place."""
    folded = unicodedata.normalize("NFKD", location).encode("ascii", "ignore").decode()
    folded = re.sub(r"['’]", "", folded)
    words = re.findall(r"[A-Za-z]+", folded)
    extra = [CODES[w.lower()] for w in words if w.lower() in CODES]
    return " ".join([folded, *extra])


def _initials(words: list[str]) -> set[str]:
    """Acronyms a run of words may go by: "Ron Joyce Stadium" -> rjs, "Chester New Hall" -> cnh."""
    names = [w for w in words if w.isalpha() and w not in {"the", "of", "and", "mcmaster", "university"}]
    return {"".join(w[0] for w in names[i:j]) for i in range(len(names)) for j in range(i + 2, len(names) + 1)}


def _parts(location: str) -> tuple[set[str], set[str], set[str]] | None:
    """(building words, room numbers, acronyms its words make), or None when it names no place."""
    text = POSTAL.sub(" ", CITY.sub("", location.strip()))
    if not text or NO_PLACE.match(text) or ONLINE.search(text):
        return None
    # A street address names the place, but not in words we can compare with a building's.
    if ADDRESS.search(text) and not re.search(r"[a-z]", ADDRESS.sub(" ", text).lower().replace("room", "")):
        return None
    text = ADDRESS.sub(" ", text)
    words = re.findall(r"[a-z0-9]+", expand_codes(text).lower())
    raw = re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower())
    building = {w for w in words if w.isalpha() and len(w) > 1} - GENERIC_PLACE_WORDS - DESCRIPTIVE
    # A known building named in full counts as its code: "Burke Science Building" is BSB.
    joined = " ".join(words)
    for code, full in CODES.items():
        name = [w for w in re.findall(r"[a-z0-9]+", full.lower()) if w not in {"mcmaster", "university"} and len(w) > 1]
        if name and re.search(r"\b" + r"\W+(?:\w\W+)?".join(map(re.escape, name)) + r"\b", joined):
            building.add(code)
    # Room numbers by their digits: "JHE 326H" is JHE 326, "Rooms 311-313" are 311 and 313.
    rooms = {re.sub(r"\D", "", w) for w in words if any(c.isdigit() for c in w) and not ORDINAL.match(w)} - {""}
    return building, rooms, _initials(raw)


def place_match(a: str | None, b: str | None) -> str | None:
    """"same" (the same room), "different" (different buildings or rooms), or None when
    the places can't tell: one is missing or online, or they share a building but not a room.

    Buildings compare by name, code or acronym: "KTH 109" and "Kenneth Taylor Hall 109"
    are one room, "RJS" is Ron Joyce Stadium, "CNH 102" and "Hamilton Hall 102" differ.
    """
    if not a or not b:
        return None
    pa, pb = _parts(a), _parts(b)
    if pa is None or pb is None:
        return None
    (wa, ra, ia), (wb, rb, ib) = pa, pb
    if not wa or not wb:
        return None
    if not (wa & wb or wa & ib or wb & ia):
        return "different"
    if ra and rb:
        return "same" if ra & rb else "different"
    return None
