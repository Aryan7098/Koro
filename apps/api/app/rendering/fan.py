"""Fan nudge generation — one Sonnet call per event, returns all languages.

Multi-language *in one call*: the tool schema demands a nudge for each requested
language. This costs one request per event, cache-warmed on subsequent events.

Fallback (no API key): produce a minimal English nudge from the SOP so the loop
still works in dev.
"""
from __future__ import annotations

import json
from typing import Any

from app.core.catalog import label
from app.core.config import settings
from app.llm import client as llm
from app.rendering.context import RenderContext

TOOL_NAME = "render_fan_nudges"
TOOL_DESC = (
    "Produce a short, warm, non-alarmist fan nudge in every requested language. "
    "Ground every place reference in the provided venue graph subset."
)


ROLE_INTRO_FAN = (
    "You are the fan-facing voice of EchoStand at a FIFA World Cup match. "
    "You speak warmly, briefly, and in the fan's language. You reassure them "
    "their report was heard (\"247 fans flagged this — crew is on the way\") "
    "and give one clear next step referencing the venue graph. You never invent "
    "gate/section names. Emergencies are handled by staff — you do not evacuate."
)


def _tool_schema(languages: list[str], graph_subset_ids: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "nudges": {
                "type": "object",
                "properties": {
                    lang: {
                        "type": "object",
                        "properties": {
                            "headline": {"type": "string"},
                            "body": {"type": "string"},
                            "action_hint": {"type": "string"},
                            "next_node_id": {
                                "type": ["string", "null"],
                                "enum": graph_subset_ids + [None],
                            },
                        },
                        "required": ["headline", "body"],
                    }
                    for lang in languages
                },
                "required": languages,
            },
            "uncertain": {"type": "boolean"},
        },
        "required": ["nudges"],
    }


async def render_fan_nudge(
    *,
    ctx: RenderContext,
    event_summary: str,
    band: str,
    severity: str,
    source_mix: dict[str, Any],
    languages: list[str] | None = None,
    accessibility: dict | None = None,
) -> dict | None:
    langs = languages or settings.supported_languages_list
    total = sum(source_mix.get(k, 0) for k in ("T0", "T1", "T2", "T3"))

    user_message = json.dumps(
        {
            "event": {
                "node_id": ctx.node_id,
                "category": ctx.category,
                "summary": event_summary,
                "confidence_band": band,
                "severity": severity,
                "reporters_total": total,
                "source_mix": source_mix,
            },
            "audience": {
                "role": "fan",
                "languages": langs,
                "accessibility": accessibility or {},
            },
            "instructions": (
                "Produce one nudge per requested language. Reassure the fan their report "
                "was heard using ``reporters_total``. Suggest one specific next action "
                "from the venue graph (nearest open same-type destination). If the fan's "
                "accessibility profile has ``mobility=true``, prefer step-free edges. "
                "If ``sensory=true``, prefer low-stimulus edges."
            ),
        },
        ensure_ascii=False,
        indent=2,
    )

    result = await llm.call_reason(
        system_blocks=llm.system_with_cache(cached=ctx.cached_system(ROLE_INTRO_FAN)),
        user_message=user_message,
        tool_name=TOOL_NAME,
        tool_schema=_tool_schema(langs, ctx.graph_subset_ids),
        tool_description=TOOL_DESC,
        max_tokens=1500,
    )
    if result is None:
        return _offline_fan(ctx, event_summary, band, langs)
    return result


def _offline_fan(ctx: RenderContext, summary: str, band: str, langs: list[str]) -> dict:
    """Minimal fallback when Claude isn't available. English-only, category-tagged."""
    cat = label(ctx.category, "en")
    body = f"{summary} — a crew has been notified."
    if band == "RUMOR":
        body = f"We've noted a report of {cat.lower()}. Checking with others nearby."
    out = {}
    for lang in langs:
        out[lang] = {
            "headline": f"{cat} noticed",
            "body": body,
            "action_hint": None,
            "next_node_id": None,
        }
    return {"nudges": out, "uncertain": True}
