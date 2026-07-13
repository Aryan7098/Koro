"""Anthropic Claude client wrapper.

Two helpers:
    - :func:`call_fast`      — Claude Haiku 4.5, for normalize/geo-resolve.
    - :func:`call_reason`    — Claude Sonnet 5, for severity + rendering.

Both use the tool-use pattern for structured JSON output (schema-validated,
cannot hallucinate malformed keys), and both accept a ``cached_system`` block
that we mark with ``cache_control: {type: "ephemeral"}``. This is what makes
running per-event rendering tractable — the Venue Graph + SOP context is
cached for 1h and reused across every event.

Graceful degradation (Design Commitment #5): if the API key is unset or the
call fails, callers get ``None`` and log ``UNCERTAIN`` rather than fabricate.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from anthropic import AsyncAnthropic
from anthropic.types import Message

from app.core.config import settings

log = logging.getLogger(__name__)

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic | None:
    global _client
    if not settings.anthropic_api_key:
        return None
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _extract_tool_result(msg: Message, tool_name: str) -> dict | None:
    for block in msg.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == tool_name:
            return dict(block.input)  # type: ignore[arg-type]
    return None


async def _call(
    *,
    model: str,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int = 2048,
    temperature: float = 0.2,
) -> dict | None:
    client = _get_client()
    if client is None:
        log.warning("no ANTHROPIC_API_KEY — returning None (graceful degradation)")
        return None

    try:
        msg = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_blocks,
            tools=[
                {
                    "name": tool_name,
                    "description": tool_description,
                    "input_schema": tool_schema,
                }
            ],
            tool_choice={"type": "tool", "name": tool_name},
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception as e:
        log.exception("Claude call failed: %s", e)
        return None

    return _extract_tool_result(msg, tool_name)


def system_with_cache(*, cached: str, dynamic: str = "") -> list[dict]:
    """Compose the system prompt: cached block first (ephemeral cache_control),
    then a small dynamic tail that varies per call.

    Prompt caching TTL is 1h by default — perfect for Venue Graph + SOP corpus
    that changes on the order of matches, not minutes.
    """
    blocks: list[dict] = [
        {
            "type": "text",
            "text": cached,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    if dynamic:
        blocks.append({"type": "text", "text": dynamic})
    return blocks


async def call_fast(
    *,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int = 2048,
) -> dict | None:
    """Haiku 4.5 — cheap, fast, batched. For normalize/geo-resolve."""
    return await _call(
        model=settings.claude_model_fast,
        system_blocks=system_blocks,
        user_message=user_message,
        tool_name=tool_name,
        tool_schema=tool_schema,
        tool_description=tool_description,
        max_tokens=max_tokens,
        temperature=0.1,
    )


async def call_reason(
    *,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int = 4096,
) -> dict | None:
    """Sonnet 5 — for severity inference + multi-audience rendering."""
    return await _call(
        model=settings.claude_model_reason,
        system_blocks=system_blocks,
        user_message=user_message,
        tool_name=tool_name,
        tool_schema=tool_schema,
        tool_description=tool_description,
        max_tokens=max_tokens,
        temperature=0.3,
    )


def as_pretty_json(x: Any) -> str:
    return json.dumps(x, ensure_ascii=False, indent=2)
