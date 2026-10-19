"""Worker settings: secrets from worker/.env, campus values from campus.config.json."""

from __future__ import annotations

import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

WORKER_DIR = Path(__file__).resolve().parent
load_dotenv(WORKER_DIR / ".env")

CAMPUS = json.loads((WORKER_DIR.parent / "campus.config.json").read_text(encoding="utf-8"))
LOCAL_TZ = ZoneInfo(CAMPUS["timezone"])


def env(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name) or default


def require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} is not set. Add it to worker/.env (see worker/.env.example).")
    return value


# "auto" uses the profile page and falls back to Apify when it is blocked;
# "primary" or "apify" forces one backend.
FETCH_BACKEND = env("FETCH_BACKEND", "auto")

# Which LLM reads posts: "claude" or "gemini".
EXTRACTOR = env("EXTRACTOR", "claude")

# First pass: reads every new post. At xhigh effort Haiku 5.5 matched Haiku 4.5 on the
# 73 Opus-checked posts for a seventh of the cost (2026-10-13).
CLAUDE_MODEL = env("CLAUDE_MODEL", "claude-haiku-5-5")
# How hard the first pass thinks (Haiku 4.5 ignores it). On the 73 Opus-checked posts Haiku 5.5
# missed 3 of 11 free-food posts at medium and 1 at xhigh, for 0.02 cents more a post at xhigh.
# Not read from CLAUDE_EFFORT: Claude Code sets that for itself, so runs started from it would differ.
CLAUDE_EFFORT = env("EXTRACT_EFFORT", "xhigh")
# Second pass: rechecks every post where the first pass found free food, and
# its dates and times win. "none" turns the check off.
VERIFY_MODEL = env("VERIFY_MODEL", "claude-sonnet-5-5")
# Tie-breaker: reads a post again only when the first two readings disagree. "none" turns it off.
TIEBREAK_MODEL = env("TIEBREAK_MODEL", "claude-opus-5-5")
# How hard the check and the tie-breaker think.
CHECK_EFFORT = env("CHECK_EFFORT", "medium")

# Events at or above these confidences are published without review when the
# check agreed and nothing similar is known (see auto_approve.py). Free food
# needs more: both models can wrongly assume food is free, while for other
# events the risk is the date, which the check covers. "none" for the first
# sends every event to the review queue.
_auto = env("AUTO_APPROVE_MIN_CONFIDENCE", "0.9")
AUTO_APPROVE_MIN_CONFIDENCE = None if _auto.lower() == "none" else float(_auto)
AUTO_APPROVE_OTHER_MIN_CONFIDENCE = float(env("AUTO_APPROVE_OTHER_MIN_CONFIDENCE", "0.75"))

# Rubric (campus.hellorubric.com), the MSU's club platform, as a second event
# source: rubric.py fetches it each run, merge.py combines it with Instagram.
# RUBRIC_MERGE "report" only prints what merging would change; "apply" saves it.
RUBRIC_ENABLED = env("RUBRIC_ENABLED", "true").lower() != "false"
RUBRIC_MERGE = env("RUBRIC_MERGE", "report")
RUBRIC_EVERY_MINUTES = int(env("RUBRIC_EVERY_MINUTES", "60"))  # the worker runs every 15; Rubric needn't
RUBRIC_USER_AGENT = env(
    "RUBRIC_USER_AGENT",
    "MacCushionCalendar/1.0 (+https://mac-cushion-calendar.vercel.app; McMaster student events calendar)",
)

GEMINI_MODEL = env("GEMINI_MODEL", "gemini-3.8-flash")
# Free-tier requests-per-minute limits are low; space calls out.
GEMINI_MIN_INTERVAL_S = float(env("GEMINI_MIN_INTERVAL_S", "5"))

# USD per million tokens (input, output, cache read). Only used to estimate
# cost in the llm_usage log; includes the models a Claude refusal fallback can
# land on. Gemini is 0 on the free tier; update it if billing is turned on.
MODEL_PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-opus-5": (5.00, 25.00, 0.50),
    "claude-opus-4-8": (5.00, 25.00, 0.50),
    "claude-sonnet-5-5": (2.00, 10.00, 0.10),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),  # prompts up to 100k tokens
    "claude-haiku-4-5": (1.00, 5.00, 0.10),
    "gemini-3.8-flash": (0.0, 0.0, 0.0),
}

POST_IMAGE_BUCKET = "post-images"
# Posts older than this when first seen are stored but not sent to Claude.
MAX_POST_AGE_DAYS = int(env("MAX_POST_AGE_DAYS", "7"))
# Reels are stored but not read: clubs post a flyer for anything they promote,
# so a reel mostly duplicates it. "false" reads them again.
SKIP_REELS = env("SKIP_REELS", "true").lower() != "false"
# Cap on Claude calls per run, so a burst of new clubs can't run up a big bill.
MAX_EXTRACTIONS_PER_RUN = int(env("MAX_EXTRACTIONS_PER_RUN", "50"))
