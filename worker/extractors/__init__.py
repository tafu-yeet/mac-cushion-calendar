"""Extract event details from a club post (caption + image) with an LLM.

EXTRACTOR picks the first-pass backend: "claude" (the Anthropic API, model
CLAUDE_MODEL) or "gemini" (Google's Gemini API). VERIFY_MODEL rechecks posts
where the first pass found free food (see two_stage.py). Each post can announce
zero or more events; results go to the review queue as "pending" (see
store.save_extraction).
"""

from __future__ import annotations

import settings

from .base import (
    ExtractedEvent,
    ExtractionError,
    Extractor,
    ExtractorUnavailable,
    PostExtraction,
    Usage,
)
from .two_stage import FinalEvent, PostResult, TwoStageExtractor

__all__ = [
    "ExtractedEvent", "ExtractionError", "Extractor", "ExtractorUnavailable", "FinalEvent",
    "PostExtraction", "PostResult", "TwoStageExtractor", "Usage", "new_extractor", "new_pipeline",
]


def new_pipeline(check: bool = True) -> TwoStageExtractor:
    """The configured first pass plus, unless VERIFY_MODEL is "none", the date check."""
    verifier = None
    if check and settings.VERIFY_MODEL.lower() != "none":
        from .claude import ClaudeExtractor

        verifier = ClaudeExtractor(settings.VERIFY_MODEL, cache=False)
    return TwoStageExtractor(new_extractor(), verifier)


def new_extractor(name: str | None = None, model: str | None = None) -> Extractor:
    """The configured backend; `model` overrides CLAUDE_MODEL (Claude only)."""
    choice = name or settings.EXTRACTOR
    if choice == "claude":
        from .claude import ClaudeExtractor

        return ClaudeExtractor(model)
    if choice == "gemini":
        from .gemini import GeminiExtractor

        return GeminiExtractor()
    raise SystemExit(f"Unknown EXTRACTOR {choice!r}; use claude or gemini.")
