"""Provider-agnostic LLM client.

Supports two providers, switched via ``settings.llm_provider``:

    - "gemini"    — Google Gemini 2.5 Flash via ``google-genai``. Free-tier
                    friendly (no card required). Structured output via JSON
                    schema in ``response_schema``.
    - "anthropic" — Claude Haiku 4.5 (fast) + Sonnet 5 (reason), tool-use for
                    structured output, prompt caching on the cached block.

Two entry points:
    - :func:`call_fast`   — normalize / geo-resolve. Uses the "fast" model.
    - :func:`call_reason` — severity + rendering. Uses the "reason" model.

Both return the tool's structured output as a dict, or None on any failure
(the caller degrades gracefully — Design Commitment #5).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings

log = logging.getLogger(__name__)


# ---------- Anthropic path ------------------------------------------------

_anthropic_client = None


def _get_anthropic():
    global _anthropic_client
    if not settings.anthropic_api_key:
        return None
    if _anthropic_client is None:
        from anthropic import AsyncAnthropic  # lazy — provider may be unused

        _anthropic_client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _anthropic_client


def _extract_tool_result(msg, tool_name: str) -> dict | None:
    for block in msg.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == tool_name:
            return dict(block.input)  # type: ignore[arg-type]
    return None


async def _call_anthropic(
    *,
    model: str,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int,
    temperature: float,
) -> dict | None:
    client = _get_anthropic()
    if client is None:
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
        log.exception("anthropic call failed: %s", e)
        return None
    return _extract_tool_result(msg, tool_name)


# ---------- Gemini path ---------------------------------------------------

_gemini_client = None


def _get_gemini():
    global _gemini_client
    if not settings.gemini_api_key:
        return None
    if _gemini_client is None:
        try:
            from google import genai  # lazy — provider may be unused
        except ImportError:
            log.warning("google-genai not installed — pip install google-genai")
            return None
        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


# Gemini's response_schema uses uppercase "type" values (STRING, OBJECT, ...).
# The tool schemas we hand in are written for Anthropic (lowercase JSON Schema),
# so translate on the fly.
def _translate_schema_for_gemini(schema: Any) -> Any:
    if isinstance(schema, dict):
        out = {}
        for k, v in schema.items():
            if k == "type":
                # Handle nullable via union or list types → strip nulls
                if isinstance(v, list):
                    non_null = [t for t in v if t != "null"]
                    v = non_null[0] if non_null else "string"
                if isinstance(v, str):
                    out[k] = v.upper()
                else:
                    out[k] = v
            else:
                out[k] = _translate_schema_for_gemini(v)
        return out
    if isinstance(schema, list):
        return [_translate_schema_for_gemini(x) for x in schema]
    return schema


def _system_text(system_blocks: list[dict]) -> str:
    parts: list[str] = []
    for b in system_blocks:
        if isinstance(b, dict) and b.get("type") == "text":
            parts.append(b.get("text", ""))
        elif isinstance(b, str):
            parts.append(b)
    return "\n\n".join(parts)


async def _call_gemini(
    *,
    model: str,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int,
    temperature: float,
) -> dict | None:
    client = _get_gemini()
    if client is None:
        log.warning("no GEMINI_API_KEY — returning None (graceful degradation)")
        return None
    try:
        from google.genai import types  # type: ignore

        response_schema = _translate_schema_for_gemini(tool_schema)
        cfg = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
            response_schema=response_schema,
            system_instruction=_system_text(system_blocks),
        )
        # google-genai's SDK is sync-only for generate_content in older versions.
        # Wrap in a threadpool so we don't block the event loop.
        import asyncio

        def _sync_call() -> Any:
            return client.models.generate_content(
                model=model,
                contents=user_message,
                config=cfg,
            )

        response = await asyncio.to_thread(_sync_call)
        text = response.text  # type: ignore[union-attr]
        if not text:
            return None
        return json.loads(text)
    except Exception as e:
        log.exception("gemini call failed: %s", e)
        return None


# ---------- public API ----------------------------------------------------


def system_with_cache(*, cached: str, dynamic: str = "") -> list[dict]:
    """Compose the system prompt: cached block + optional dynamic tail.

    On Anthropic, the cached block gets ``cache_control: ephemeral`` and is
    reused across events (1h TTL). On Gemini, prompt caching is implicit
    server-side for repeated content — no attribute needed.
    """
    blocks: list[dict] = [
        {
            "type": "text",
            "text": cached,
            "cache_control": {"type": "ephemeral"},  # ignored by Gemini adapter
        }
    ]
    if dynamic:
        blocks.append({"type": "text", "text": dynamic})
    return blocks


async def _call(
    *,
    fast: bool,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int,
    temperature: float,
) -> dict | None:
    provider = (settings.llm_provider or "gemini").lower()
    if provider == "anthropic":
        model = settings.claude_model_fast if fast else settings.claude_model_reason
        return await _call_anthropic(
            model=model,
            system_blocks=system_blocks,
            user_message=user_message,
            tool_name=tool_name,
            tool_schema=tool_schema,
            tool_description=tool_description,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    # default: gemini
    model = settings.gemini_model_fast if fast else settings.gemini_model_reason
    return await _call_gemini(
        model=model,
        system_blocks=system_blocks,
        user_message=user_message,
        tool_name=tool_name,
        tool_schema=tool_schema,
        tool_description=tool_description,
        max_tokens=max_tokens,
        temperature=temperature,
    )


async def call_fast(
    *,
    system_blocks: list[dict],
    user_message: str,
    tool_name: str,
    tool_schema: dict,
    tool_description: str,
    max_tokens: int = 2048,
) -> dict | None:
    """Fast, cheap, batched — for normalize / geo-resolve."""
    return await _call(
        fast=True,
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
    """Higher quality — for severity + multi-audience rendering."""
    return await _call(
        fast=False,
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
