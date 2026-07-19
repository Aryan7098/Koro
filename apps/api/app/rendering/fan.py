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
from app.rendering.pathplan import PlannedRoute, plan_reroute

TOOL_NAME = "render_fan_nudges"
TOOL_DESC = (
    "Produce a short, warm, non-alarmist fan nudge in every requested language. "
    "Ground every place reference in the provided venue graph subset."
)


ROLE_INTRO_FAN = (
    "You are the fan-facing voice of Koro at a FIFA World Cup match. "
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
    fan_home_id: str | None = None,
) -> dict | None:
    """Render a fan nudge.

    When ``fan_home_id`` and an accessibility profile are provided, compute a
    graph-verified reroute via Dijkstra *before* the LLM call and inject the
    fixed path into the system prompt. The tool schema still restricts
    ``next_node_id`` to nodes from the venue subset, so the LLM cannot invent
    a different destination.
    """
    langs = languages or settings.supported_languages_list
    total = sum(source_mix.get(k, 0) for k in ("T0", "T1", "T2", "T3"))

    # Accessibility-aware Dijkstra — deterministic, graph-verified.
    route: PlannedRoute | None = None
    if fan_home_id and (accessibility or {}):
        route = plan_reroute(
            ctx.graph,
            from_id=fan_home_id,
            category=ctx.category,
            avoid_id=ctx.node_id,
            accessibility=accessibility,
        )

    dynamic_route_block = route.as_prompt_block() if route and route.node_path else ""

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
                "home_node_id": fan_home_id,
            },
            "planned_route_hint": {
                "from": route.from_id if route else None,
                "to": route.to_id if route else None,
                "node_path": route.node_path if route else [],
                "distance_m": route.distance_m if route else None,
                "step_free_verified": route.step_free if route else None,
                "low_stimulus_verified": route.low_stimulus if route else None,
                "reason": route.reason if route else None,
            } if route and route.node_path else None,
            "instructions": (
                "Produce one nudge per requested language. Reassure the fan their report "
                "was heard using ``reporters_total``. If ``planned_route_hint`` is present, "
                "you MUST follow that exact path — describe it in prose, set ``next_node_id`` "
                "to the second node of the path (the first step after the fan's current "
                "location). Do not name any node not in the path. If there is no planned "
                "route, suggest one specific next action grounded in the venue graph subset."
            ),
        },
        ensure_ascii=False,
        indent=2,
    )

    result = await llm.call_reason(
        system_blocks=llm.system_with_cache(
            cached=ctx.cached_system(ROLE_INTRO_FAN),
            dynamic=dynamic_route_block,
        ),
        user_message=user_message,
        tool_name=TOOL_NAME,
        tool_schema=_tool_schema(langs, ctx.graph_subset_ids),
        tool_description=TOOL_DESC,
        max_tokens=1500,
    )
    if result is None:
        return _offline_fan(ctx, event_summary, band, langs, route=route)
    # Attach the deterministic route so the ledger + UI can display it verbatim.
    if route and route.node_path:
        result["_planned_route"] = {
            "from": route.from_id,
            "to": route.to_id,
            "node_path": route.node_path,
            "node_names": route.node_names,
            "distance_m": route.distance_m,
            "step_free": route.step_free,
            "low_stimulus": route.low_stimulus,
            "reason": route.reason,
        }
    return result


def _offline_fan(
    ctx: RenderContext, summary: str, band: str, langs: list[str],
    route: PlannedRoute | None = None,
) -> dict:
    """Minimal fallback when Claude isn't available. English-only, category-tagged."""
    cat = label(ctx.category, "en")
    body = f"{summary} — a crew has been notified."
    if band == "RUMOR":
        body = f"We've noted a report of {cat.lower()}. Checking with others nearby."
    action_hint = None
    next_node = None
    if route and route.node_path and len(route.node_path) >= 2:
        target_name = route.node_names[-1]
        action_hint = f"try {target_name} instead"
        next_node = route.node_path[1]
        body += f" Alternate route: {' → '.join(route.node_names)}."
    out = {}
    for lang in langs:
        out[lang] = {
            "headline": f"{cat} noticed",
            "body": body,
            "action_hint": action_hint,
            "next_node_id": next_node,
        }
    result: dict = {"nudges": out, "uncertain": True}
    if route and route.node_path:
        result["_planned_route"] = {
            "from": route.from_id,
            "to": route.to_id,
            "node_path": route.node_path,
            "node_names": route.node_names,
            "distance_m": route.distance_m,
            "step_free": route.step_free,
            "low_stimulus": route.low_stimulus,
            "reason": route.reason,
        }
    return result
