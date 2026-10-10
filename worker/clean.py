"""Cleans AI-written phrases before they're saved.

The model sometimes leaves notes for the reviewer in student-facing fields:
"yummy treats (unspecified)", "free food (pizza emoji in caption; specific
items not stated)", "room 102 per flyer; caption says CNH 112". The site runs
the same rules before display (src/lib/clean.ts), so keep the two in step.

Run directly to clean rows saved before this existed:
    python clean.py           list what would change
    python clean.py --apply   save the changes
"""

from __future__ import annotations

import argparse
import re

# Words that mark a bracketed or trailing bit as a note about the post, not part of the place.
NOTE_WORDS = re.compile(
    r"\b(caption|flyer|poster|post|stated|unspecified|implied|presumably|inferred|unclear|note|updated|per)\b", re.I
)
EDGE_PUNCTUATION = re.compile(r"^[\s,.;:–—-]+|[\s,.;:–—-]+$")


def _drop_repeated_words(text: str) -> str:
    """"Free free pizza" -> "Free pizza"."""
    return re.sub(r"\b(\w+)(\s+\1\b)+", r"\1", text, flags=re.I)


def _tidy(text: str) -> str | None:
    s = EDGE_PUNCTUATION.sub("", re.sub(r"\s{2,}", " ", _drop_repeated_words(text)))
    return s or None


def clean_food(text: str | None) -> str | None:
    """The food phrase a student reads on a card: no brackets, no notes."""
    if not text:
        return None
    s = re.sub(r"\s*[(\[][^)\]]*[)\]]", "", text)  # every bracketed aside
    s = re.split(r"\s*;\s*", s)[0]  # anything after a semicolon is a note
    s = re.sub(r",?\s*(specific )?(items|details|food) (are )?not (stated|specified)\b.*$", "", s, flags=re.I)
    s = re.sub(r"\bunspecified\b", "", s, flags=re.I)
    return _tidy(s)


def clean_place(text: str | None) -> str | None:
    """The place as a student would look for it; keeps a building name in brackets, drops notes."""
    if not text:
        return None
    s = re.sub(r"\s*\(([^)]*)\)", lambda m: "" if NOTE_WORDS.search(m.group(1)) else m.group(0), text)
    s = re.split(r"\s*;\s*", s)[0]
    s = re.sub(r"\s+(per|according to)\s+(the\s+)?(flyer|caption|post|poster)\b", "", s, flags=re.I)
    return _tidy(s)


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean food and location text on saved events.")
    parser.add_argument("--apply", action="store_true", help="save the changes (otherwise just list them)")
    args = parser.parse_args()

    from store import connect

    sb = connect()
    rows = sb.table("events").select("id, status, food_description, location").execute().data
    changed = 0
    for row in rows:
        update = {}
        for field, clean in (("food_description", clean_food), ("location", clean_place)):
            cleaned = clean(row[field])
            if cleaned != row[field]:
                update[field] = cleaned
                print(f"  #{row['id']} ({row['status']}) {field}: {row[field]!r} -> {cleaned!r}")
        if update:
            changed += 1
            if args.apply:
                sb.table("events").update(update).eq("id", row["id"]).execute()
    print(f"{changed} of {len(rows)} event(s) {'cleaned' if args.apply else 'would change'}")


if __name__ == "__main__":
    main()
