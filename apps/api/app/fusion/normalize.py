"""Normalize step — Haiku batch call.

Input: a batch of raw ``Report`` rows (up to ~20 per call).
Output: per-report normalized dict::

    {
        "id": "<report_id>",
        "category": "spill" | "medical" | ... | "UNCERTAIN",
        "severity_hint": "LOW" | "MED" | "HIGH" | "CRITICAL" | "UNCERTAIN",
        "location_phrase": "near restroom 112" | null,
        "canonical_en": "toilet area near section 112 is flooded",
        "uncertain": bool,
        "reasoning": "..."
    }

Guardrails (Design Commitment #1):
    - Category MUST come from the shared catalog.
    - If unsure, output ``UNCERTAIN`` rather than guess.
    - Preserve original text verbatim (we never overwrite ``raw_text``).
"""
from __future__ import annotations

import json
from typing import Any

from app.core.catalog import load_categories
from app.llm import client as llm

TOOL_NAME = "normalize_reports"
TOOL_DESC = (
    "Normalize a batch of raw fan/volunteer reports into a structured, English-canonical "
    "form suitable for clustering and severity inference. Preserve original wording — "
    "do not invent facts. Use UNCERTAIN when the input is too ambiguous."
)


def _tool_schema() -> dict:
    categories = list(load_categories().keys()) + ["UNCERTAIN"]
    return {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "category": {"type": "string", "enum": categories},
                        "severity_hint": {
                            "type": "string",
                            "enum": ["LOW", "MED", "HIGH", "CRITICAL", "UNCERTAIN"],
                        },
                        "location_phrase": {"type": ["string", "null"]},
                        "canonical_en": {"type": "string"},
                        "uncertain": {"type": "boolean"},
                        "reasoning": {"type": "string"},
                    },
                    "required": [
                        "id",
                        "category",
                        "severity_hint",
                        "canonical_en",
                        "uncertain",
                    ],
                },
            }
        },
        "required": ["results"],
    }


CACHED_SYSTEM = """You are the normalize step of Koro's fusion pipeline. \
You process raw, noisy, multilingual fan/volunteer reports from a stadium and \
produce structured, English-canonical output that downstream clustering and \
severity steps can consume.

Rules — non-negotiable:
1. NEVER invent venue facts (section numbers, gate names, staff names, times). \
   Only extract what the report actually says. If the report is vague, output UNCERTAIN.
2. ``category`` MUST be one of the allowed enum values. If none clearly matches, use "UNCERTAIN".
3. ``canonical_en`` is a short (≤25 words) English restatement that preserves the \
   observer's intent. Do not embellish. Do not soften emergencies.
4. ``severity_hint`` is what the *reporter's own tone* implies, not what you think \
   is objectively true. A calm "long line" report gets LOW even if lines are dangerous elsewhere.
5. If the report is empty or nonsense, mark uncertain=true and category=UNCERTAIN.
6. Preserve original meaning across languages. Do not translate slang literally.
"""


async def normalize_batch(items: list[dict[str, Any]]) -> list[dict] | None:
    """Normalize a batch. Each item: {id, text, language, category_hint, node_hint}.

    Returns None on total LLM failure; the fusion tick will retry next round.
    Individual items with insufficient signal come back as ``UNCERTAIN`` rather
    than dropped, so lineage is preserved.
    """
    if not items:
        return []

    user_msg = "Normalize these reports:\n\n" + json.dumps(
        {"reports": items}, ensure_ascii=False, indent=2
    )

    result = await llm.call_fast(
        system_blocks=llm.system_with_cache(cached=CACHED_SYSTEM),
        user_message=user_msg,
        tool_name=TOOL_NAME,
        tool_schema=_tool_schema(),
        tool_description=TOOL_DESC,
        max_tokens=3000,
    )
    if result is None:
        return None
    return result.get("results", [])


def offline_normalize(item: dict) -> dict:
    """Fallback when the LLM is unavailable — use the client-provided hints
    verbatim and mark uncertain. Keeps the pipeline moving in dev without a key."""
    cat = item.get("category_hint") or "UNCERTAIN"
    return {
        "id": item["id"],
        "category": cat if cat in load_categories() else "UNCERTAIN",
        "severity_hint": "UNCERTAIN",
        "location_phrase": item.get("node_hint"),
        "canonical_en": item.get("text") or "(no text)",
        "uncertain": True,
        "reasoning": "offline fallback (no ANTHROPIC_API_KEY)",
    }
