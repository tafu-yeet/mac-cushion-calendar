"""Claude backend: the Anthropic API with structured output."""

from __future__ import annotations

import base64
from datetime import datetime

import anthropic

from settings import CLAUDE_EFFORT, CLAUDE_MODEL

from .base import (
    ExtractionError,
    ExtractorUnavailable,
    PostExtraction,
    Usage,
    image_media_type,
    post_text,
    system_prompt,
)

# Server-side refusal fallback: a declined request is retried on the model
# Anthropic recommends for that refusal category.
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 16000
# The system prompt and output schema (~2,250 tokens) are identical on every
# call, so they're cached. Posts trickle in a few per hour, which outlives the
# default 5-minute cache, so use the 1-hour TTL (writes cost 2x, reads ~0.1x).
CACHE_CONTROL = {"type": "ephemeral", "ttl": "1h"}
CACHE_WRITE_MULTIPLIER = 2.0


def model_options(model: str) -> dict:
    """Request options that differ by model."""
    if model.startswith("claude-haiku-4-5"):
        # Haiku 4.5 rejects the effort parameter and has no server-side
        # fallback; without a thinking config it answers without thinking.
        return {}
    return {"betas": [FALLBACK_BETA], "fallbacks": "default", "output_config": {"effort": CLAUDE_EFFORT}}


class ClaudeExtractor:
    name = "claude"

    def __init__(self, model: str | None = None, cache: bool = True) -> None:
        """`cache=False` for a model called only now and then: its cache would
        expire between calls, so every call would pay the 2x write."""
        self.client = anthropic.Anthropic()
        self.model = model or CLAUDE_MODEL
        self.cache = cache

    def extract(
        self, *, club_name: str, username: str, posted_at: datetime, caption: str, image: bytes | None
    ) -> tuple[PostExtraction, Usage]:
        content = []
        media_type = image_media_type(image) if image else None
        if media_type:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(image).decode()},
            })
        content.append({"type": "text", "text": post_text(club_name, username, posted_at, caption, bool(media_type))})

        try:
            response = self.client.beta.messages.parse(
                model=self.model,
                max_tokens=MAX_TOKENS,
                **model_options(self.model),
                system=[{"type": "text", "text": system_prompt(), **({"cache_control": CACHE_CONTROL} if self.cache else {})}],
                messages=[{"role": "user", "content": content}],
                output_format=PostExtraction,
            )
        except anthropic.APIConnectionError as e:
            raise ExtractorUnavailable(f"Claude API unreachable ({e})") from e
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, anthropic.NotFoundError) as e:
            # A bad key or model name affects every post.
            raise ExtractorUnavailable(
                f"Claude API rejected the request (HTTP {e.status_code}); check ANTHROPIC_API_KEY and CLAUDE_MODEL. {e}",
                temporary=False,
            ) from e
        except anthropic.APIStatusError as e:
            if e.status_code == 429 or e.status_code >= 500:
                raise ExtractorUnavailable(f"Claude API busy (HTTP {e.status_code})") from e
            raise ExtractionError(str(e)) from e

        usage = Usage(
            model=response.model,
            stop_reason=response.stop_reason,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
            cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
            cache_write_multiplier=CACHE_WRITE_MULTIPLIER,
        )
        if response.stop_reason == "refusal":
            category = response.stop_details.category if response.stop_details else None
            raise ExtractionError(f"refused (category: {category})", usage)
        if response.stop_reason == "max_tokens":
            raise ExtractionError("output hit max_tokens", usage)
        if response.parsed_output is None:
            raise ExtractionError(f"no parsed output (stop_reason: {response.stop_reason})", usage)
        return response.parsed_output, usage
