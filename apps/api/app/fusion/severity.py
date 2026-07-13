"""Severity inference — Claude Sonnet 5.

Reads unstructured human signal into a strict {LOW, MED, HIGH, CRITICAL} class.
Cached per (event_id, source-set hash) in Redis so we don't re-infer severity on
every fusion tick — only when the report set actually changes.
"""
from __future__ import annotations

import hashlib
import json

from app.core.catalog import default_severity, is_safety_critical
from app.core.redis import get_redis
from app.llm import client as llm

TOOL_NAME = "infer_severity"
TOOL_DESC = (
    "Infer the severity class of the underlying real-world situation described by a cluster "
    "of reports. Return LOW / MED / HIGH / CRITICAL plus one short rationale."
)

TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "severity": {"type": "string", "enum": ["LOW", "MED", "HIGH", "CRITICAL"]},
        "reasoning": {"type": "string"},
    },
    "required": ["severity", "reasoning"],
}


CACHED_SYSTEM = """You are the severity step of EchoStand's fusion pipeline.

Rules — non-negotiable:
1. Read the cluster of reports as a whole. If any report describes an actual medical \
   emergency (unresponsive person, chest pain, seizure, severe bleeding), rate CRITICAL.
2. Fire, smoke, structural failure, weapon reports → CRITICAL.
3. Unattended package, verbal threat, credible security concern → HIGH.
4. Crowd surge >4/m² with reports of pressure, gate delays >10min affecting egress → HIGH.
5. Spills, restroom issues, wayfinding, long lines, mild smells → LOW.
6. Widespread same-category clusters (spills across 3+ sections at halftime) → MED.
7. Bias TOWARD safety — a possibly-critical report gets CRITICAL. Under-reacting is \
   worse than over-reacting. A human will confirm before any consequential action.
8. Ignore your priors about frequency; grade the *reported situation*, not the base rate.
"""


def _hash_source_set(report_ids: list[str]) -> str:
    joined = "|".join(sorted(report_ids))
    return hashlib.sha256(joined.encode()).hexdigest()[:16]


async def infer_severity(
    event_id: str,
    category: str,
    canonical_summary: str,
    report_ids: list[str],
    report_snippets: list[str],
) -> dict:
    """Returns {severity, reasoning, cached: bool, method: str}."""
    if is_safety_critical(category):
        # Category-owned bias — the model can still upgrade, but never downgrade below HIGH.
        # We still call the LLM to get a rationale, but we floor the answer.
        floor = "CRITICAL" if category in ("medical", "structural") else "HIGH"
    else:
        floor = None

    r = get_redis()
    src_hash = _hash_source_set(report_ids)
    cache_key = f"echostand:severity:{event_id}:{src_hash}"
    cached_raw = await r.get(cache_key)
    if cached_raw:
        cached = json.loads(cached_raw)
        cached["cached"] = True
        return cached

    user_msg = json.dumps(
        {
            "event_id": event_id,
            "category": category,
            "canonical_summary": canonical_summary,
            "reports": report_snippets[:20],  # cap for token budget
        },
        ensure_ascii=False,
        indent=2,
    )

    result = await llm.call_reason(
        system_blocks=llm.system_with_cache(cached=CACHED_SYSTEM),
        user_message=user_msg,
        tool_name=TOOL_NAME,
        tool_schema=TOOL_SCHEMA,
        tool_description=TOOL_DESC,
        max_tokens=512,
    )
    if result is None:
        # Graceful degradation — fall back to the category default
        result = {
            "severity": default_severity(category),
            "reasoning": "offline fallback (Claude unavailable) — used category default",
        }
        method = "fallback"
    else:
        method = "llm"

    if floor:
        order = ["LOW", "MED", "HIGH", "CRITICAL"]
        if order.index(result["severity"]) < order.index(floor):
            result["severity"] = floor
            result["reasoning"] = f"floored to {floor} by category={category}; " + result[
                "reasoning"
            ]

    payload = {"severity": result["severity"], "reasoning": result["reasoning"],
               "cached": False, "method": method}
    await r.setex(cache_key, 3600, json.dumps(payload))
    return payload
