"""Geo-resolve — pick a venue_node.id for a report.

Grounded lookup: we hand the model the *list* of candidate node ids + names +
types (from the report's ``node_hint`` neighborhood, plus a fallback of all
nodes if there's no hint). The model MUST return one of those exact ids or
UNCERTAIN. This is enforced by the tool-input schema (``enum``) so the model
can never invent a node.
"""
from __future__ import annotations

import json
from typing import Any

from app.llm import client as llm

TOOL_NAME = "resolve_location"
TOOL_DESC = (
    "Pick the single venue-graph node id that best matches the report's location. "
    "You MUST choose one of the provided ids, or return UNCERTAIN if none clearly fit."
)


def _tool_schema(candidate_ids: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "node_id": {"type": "string", "enum": candidate_ids + ["UNCERTAIN"]},
            "reasoning": {"type": "string"},
        },
        "required": ["node_id"],
    }


CACHED_SYSTEM = """You are the geo-resolve step of Koro.

Rules:
1. Choose exactly one node_id from the provided candidates. Never invent one.
2. If the report is too vague or none of the candidates fit, return "UNCERTAIN".
3. Prefer specific matches over concourses: "spill near restroom 112" → restroom_112, not concourse_100_n.
4. Respect the reporter's device seat_hint when available.
"""


async def resolve(
    canonical_en: str,
    node_hint: str | None,
    seat_hint: str | None,
    candidates: list[dict],
) -> dict | None:
    """candidates: list of {id, name, type, level} for nearby nodes."""
    if not candidates:
        return {"node_id": "UNCERTAIN", "reasoning": "no candidate nodes provided"}

    user_msg = "Report:\n" + json.dumps(
        {
            "text": canonical_en,
            "node_hint": node_hint,
            "seat_hint": seat_hint,
            "candidates": candidates,
        },
        ensure_ascii=False,
        indent=2,
    )
    result = await llm.call_fast(
        system_blocks=llm.system_with_cache(cached=CACHED_SYSTEM),
        user_message=user_msg,
        tool_name=TOOL_NAME,
        tool_schema=_tool_schema([c["id"] for c in candidates]),
        tool_description=TOOL_DESC,
        max_tokens=512,
    )
    return result
