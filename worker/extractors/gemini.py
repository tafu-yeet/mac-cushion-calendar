"""Gemini backend: Google's Gemini API with JSON-schema output. Needs GEMINI_API_KEY.

On the free tier, Google limits requests per minute and per day and often
answers 503 "high demand", so calls are spaced at least GEMINI_MIN_INTERVAL_S
apart and retried with backoff. If they still fail, the run stops and the
remaining posts wait for the next one.
"""

from __future__ import annotations

import time
from datetime import datetime

import httpx
from google import genai
from google.genai import errors, types
from pydantic import ValidationError

from settings import GEMINI_MIN_INTERVAL_S, GEMINI_MODEL, require

from .base import (
    ExtractionError,
    ExtractorUnavailable,
    PostExtraction,
    Usage,
    image_media_type,
    post_text,
    system_prompt,
)


class GeminiExtractor:
    name = "gemini"

    def __init__(self) -> None:
        # "High demand" 503s on the free tier usually clear within seconds, so
        # retry those (and per-minute 429s) a few times before giving up.
        retry = types.HttpRetryOptions(
            attempts=5, initial_delay=5, max_delay=60, exp_base=2, http_status_codes=[429, 500, 503, 504]
        )
        self.client = genai.Client(
            api_key=require("GEMINI_API_KEY"), http_options=types.HttpOptions(retry_options=retry)
        )
        self.config = types.GenerateContentConfig(
            system_instruction=system_prompt(),
            response_mime_type="application/json",
            response_json_schema=PostExtraction.model_json_schema(),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        self._last_call = 0.0

    def extract(
        self, *, club_name: str, username: str, posted_at: datetime, caption: str, image: bytes | None
    ) -> tuple[PostExtraction, Usage]:
        contents: list = []
        media_type = image_media_type(image) if image else None
        if media_type:
            contents.append(types.Part.from_bytes(data=image, mime_type=media_type))
        contents.append(post_text(club_name, username, posted_at, caption, bool(media_type)))

        wait = self._last_call + GEMINI_MIN_INTERVAL_S - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()
        try:
            response = self.client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=self.config)
        except errors.ServerError as e:
            raise ExtractorUnavailable(f"Gemini API error (HTTP {e.code})") from e
        except errors.ClientError as e:
            if e.code == 429:
                raise ExtractorUnavailable(f"Gemini rate limit or daily quota reached: {e.message}") from e
            if e.code in (401, 403, 404):
                raise ExtractorUnavailable(
                    f"Gemini API rejected the request (HTTP {e.code}); check GEMINI_API_KEY and GEMINI_MODEL. {e.message}",
                    temporary=False,
                ) from e
            raise ExtractionError(f"Gemini HTTP {e.code}: {e.message}") from e
        except httpx.HTTPError as e:
            raise ExtractorUnavailable(f"Gemini API unreachable ({e})") from e

        meta = response.usage_metadata
        finish = response.candidates[0].finish_reason if response.candidates else None
        usage = Usage(
            model=GEMINI_MODEL,
            stop_reason=getattr(finish, "value", finish),
            input_tokens=(meta.prompt_token_count or 0) if meta else 0,
            output_tokens=((meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0)) if meta else 0,
            cache_read_input_tokens=(meta.cached_content_token_count or 0) if meta else 0,
        )
        if not response.text:
            raise ExtractionError(f"no output (finish reason: {usage.stop_reason})", usage)
        try:
            return PostExtraction.model_validate_json(response.text), usage
        except ValidationError as e:
            raise ExtractionError(f"output didn't match the schema: {e.errors()[0]['msg']}", usage) from e
