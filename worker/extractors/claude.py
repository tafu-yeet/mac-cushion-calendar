"""Claude backend: the Anthropic API with structured output."""

from __future__ import annotations

import base64
from datetime import datetime

import anthropic
from anthropic.lib._parse._transform import transform_schema  # what messages.parse uses for output_format
from pydantic import TypeAdapter, ValidationError

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
# call (the calendar in it changes once a day), so they're cached. Posts trickle
# in a few per hour, which outlives the default 5-minute cache, so use the
# 1-hour TTL (writes cost 2x, reads 0.1x, or 0.05x on Sonnet and Opus 5.5).
# A model only caches prompts above its minimum: 512 tokens for the 5.5 models,
# but 4,096 for Haiku 4.5, so on Haiku 4.5 this marker does nothing.
CACHE_CONTROL = {"type": "ephemeral", "ttl": "1h"}
CACHE_WRITE_MULTIPLIER = 2.0
# The structured-output format for requests built by hand (batches).
OUTPUT_FORMAT = {"type": "json_schema", "schema": transform_schema(TypeAdapter(PostExtraction).json_schema())}


def model_options(model: str, effort: str) -> dict:
    """Request options that differ by model."""
    if model.startswith("claude-haiku-4-5"):
        # Haiku 4.5 rejects the effort parameter and has no server-side
        # fallback; without a thinking config it answers without thinking.
        return {}
    if model.startswith("claude-haiku"):
        # Haiku 5.5 takes effort but has no server-side fallback: a refusal stays a refusal.
        return {"output_config": {"effort": effort}}
    return {"betas": [FALLBACK_BETA], "fallbacks": "default", "output_config": {"effort": effort}}


class ClaudeExtractor:
    name = "claude"

    def __init__(self, model: str | None = None, cache: bool = True, effort: str | None = None) -> None:
        """`cache=False` for a model called only now and then: its cache would
        expire between calls, so every call would pay the 2x write. `effort`
        defaults to the first pass's."""
        self.client = anthropic.Anthropic()
        self.model = model or CLAUDE_MODEL
        self.cache = cache
        self.effort = effort or CLAUDE_EFFORT

    def _content(self, *, club_name: str, username: str, posted_at: datetime, caption: str, image: bytes | None) -> list[dict]:
        content = []
        media_type = image_media_type(image) if image else None
        if media_type:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(image).decode()},
            })
        content.append({"type": "text", "text": post_text(club_name, username, posted_at, caption, bool(media_type))})
        return content

    def _system(self) -> list[dict]:
        return [{"type": "text", "text": system_prompt(), **({"cache_control": CACHE_CONTROL} if self.cache else {})}]

    def batch_params(self, **post) -> dict:
        """The request extract() makes, as Message Batches params. Without the
        server-side fallback, which the Batches API doesn't take, and with the
        output schema written out, as messages.parse would send it."""
        effort = {} if self.model.startswith("claude-haiku-4-5") else {"effort": self.effort}
        return {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "system": self._system(),
            "messages": [{"role": "user", "content": self._content(**post)}],
            "output_config": {**effort, "format": OUTPUT_FORMAT},
        }

    def read_batch_message(self, message) -> tuple[PostExtraction, Usage]:
        """A batch result's message as extract() would return it; raises ExtractionError the same way."""
        usage = self._usage(message, batch=True)
        self._check_stop(message, usage)
        text = next((block.text for block in message.content if block.type == "text"), None)
        if not text:
            raise ExtractionError(f"no output (stop_reason: {message.stop_reason})", usage)
        try:
            return PostExtraction.model_validate_json(text), usage
        except ValidationError as e:
            raise ExtractionError(f"output didn't fit the schema: {e}", usage) from e

    @staticmethod
    def _usage(response, batch: bool = False) -> Usage:
        return Usage(
            model=response.model,
            stop_reason=response.stop_reason,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cache_creation_input_tokens=response.usage.cache_creation_input_tokens or 0,
            cache_read_input_tokens=response.usage.cache_read_input_tokens or 0,
            cache_write_multiplier=CACHE_WRITE_MULTIPLIER,
            batch=batch,
        )

    @staticmethod
    def _check_stop(response, usage: Usage) -> None:
        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            raise ExtractionError(f"refused (category: {details.category if details else None})", usage)
        if response.stop_reason == "max_tokens":
            raise ExtractionError("output hit max_tokens", usage)

    def extract(
        self, *, club_name: str, username: str, posted_at: datetime, caption: str, image: bytes | None
    ) -> tuple[PostExtraction, Usage]:
        content = self._content(club_name=club_name, username=username, posted_at=posted_at, caption=caption, image=image)
        try:
            response = self.client.beta.messages.parse(
                model=self.model,
                max_tokens=MAX_TOKENS,
                **model_options(self.model, self.effort),
                system=self._system(),
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

        usage = self._usage(response)
        self._check_stop(response, usage)
        if response.parsed_output is None:
            raise ExtractionError(f"no parsed output (stop_reason: {response.stop_reason})", usage)
        return response.parsed_output, usage
