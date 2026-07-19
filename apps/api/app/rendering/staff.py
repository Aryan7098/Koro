"""Staff work-order rendering — terse, operational.

One Sonnet call per event, English only for staff. Includes the source-evidence
summary (how many reporters, tiers, passive agreement) so staff can judge for
themselves.
"""
from __future__ import annotations

import json
from typing import Any

from app.llm import client as llm
from app.rendering.context import RenderContext

TOOL_NAME = "render_staff_workorder"
TOOL_DESC = "Produce a short, actionable staff work-order in English."

TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "action": {"type": "string"},
        "priority": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
        "eta_minutes": {"type": "integer"},
        "evidence_summary": {"type": "string"},
    },
    "required": ["headline", "action", "priority", "evidence_summary"],
}

ROLE_INTRO_STAFF = (
    "You are the staff-facing dispatch voice of Koro. Terse, operational, no fluff. "
    "You are grounded in the venue graph and SOPs. You never invent facts."
)


async def render_staff_workorder(
    *,
    ctx: RenderContext,
    event_summary: str,
    band: str,
    severity: str,
    source_mix: dict[str, Any],
    reasoning: str | None = None,
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
                "trust_reasoning": reasoning,
            },
            "instructions": (
                "Produce a work-order for the responsible on-shift staff. Include: "
                "1) one-line headline, 2) concrete action (what to do, where), "
                "3) priority ∈ {low, medium, high, critical}, 4) ETA in minutes, "
                "5) evidence_summary explaining WHY this is trustworthy "
                "(reporter counts by tier, passive-signal agreement, band)."
            ),
        },
        ensure_ascii=False,
        indent=2,
    )
    result = await llm.call_reason(
        system_blocks=llm.system_with_cache(cached=ctx.cached_system(ROLE_INTRO_STAFF)),
        user_message=user_message,
        tool_name=TOOL_NAME,
        tool_schema=TOOL_SCHEMA,
        tool_description=TOOL_DESC,
        max_tokens=600,
    )
    if result is None:
        return {
            "headline": f"{ctx.category} at {ctx.node_id}",
            "action": event_summary,
            "priority": "medium",
            "eta_minutes": 5,
            "evidence_summary": (
                f"[fallback] band={band} severity={severity} source_mix={source_mix}"
            ),
        }
    return result
