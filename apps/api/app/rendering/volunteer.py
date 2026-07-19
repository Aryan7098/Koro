"""Volunteer script rendering — do-this-say-this, for someone who started yesterday."""
from __future__ import annotations

import json
from typing import Any

from app.llm import client as llm
from app.rendering.context import RenderContext

TOOL_NAME = "render_volunteer_script"
TOOL_DESC = "Produce a do-this-say-this volunteer script, plain and confidence-building."

TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "verify_prompt": {"type": "string"},
        "do": {"type": "array", "items": {"type": "string"}},
        "say": {"type": "string"},
    },
    "required": ["do", "say"],
}

ROLE_INTRO_VOL = (
    "You are the volunteer-facing voice of Koro. Volunteers are temporary and "
    "under-trained. Give them plain imperative steps and one exact phrase to say to fans. "
    "Ground everything in the venue graph and SOPs."
)


async def render_volunteer_script(
    *,
    ctx: RenderContext,
    event_summary: str,
    band: str,
    severity: str,
    needs_verification: bool,
    source_mix: dict[str, Any],
) -> dict | None:
    user_message = json.dumps(
        {
            "event": {
                "node_id": ctx.node_id,
                "category": ctx.category,
                "summary": event_summary,
                "confidence_band": band,
                "severity": severity,
                "source_mix": source_mix,
            },
            "instructions": (
                ("Ask this volunteer to VERIFY the report — write a `verify_prompt` "
                 "with what they should look for. " if needs_verification else "")
                + "Provide a `do` array of 1-3 short imperatives, and one `say` line "
                "in plain English they can read to nearby fans."
            ),
        },
        ensure_ascii=False,
        indent=2,
    )
    result = await llm.call_reason(
        system_blocks=llm.system_with_cache(cached=ctx.cached_system(ROLE_INTRO_VOL)),
        user_message=user_message,
        tool_name=TOOL_NAME,
        tool_schema=TOOL_SCHEMA,
        tool_description=TOOL_DESC,
        max_tokens=600,
    )
    if result is None:
        return {
            "verify_prompt": "Please verify visually" if needs_verification else None,
            "do": ["Walk to the reported location", "Confirm what you see"],
            "say": "Thanks for letting us know — someone is on the way.",
        }
    return result
