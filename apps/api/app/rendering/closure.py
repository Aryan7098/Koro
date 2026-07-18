"""Loop closure — the "fixed, thanks" nudge to every fan who reported an event.

Fires from POST /staff/events/{id}/resolve. Pulls all distinct fan reporters
via event_reports → reports → users, groups by language, and dispatches a
short multi-language "resolved" nudge via SSE. Every notification is logged
to the ledger for the success-metrics endpoint (§3.8).

Offline fallback: canned translations for the 6 supported languages so the
loop-closure beat works without an ANTHROPIC_API_KEY.
"""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import label
from app.llm import client as llm
from app.models import CanonicalEvent, EventReport, Report, ResolutionLedger, User
from app.models.ledger import LedgerAction
from app.realtime import bus
from app.rendering.context import build_context

TOOL_NAME = "render_resolution_nudges"
TOOL_DESC = (
    "Produce a short, warm 'resolved — thanks for reporting' nudge in every requested "
    "language. Keep it under 20 words. Never invent facts. Include the elapsed minutes "
    "if provided."
)

ROLE_INTRO = (
    "You are the fan-facing voice of EchoStand delivering a resolution notification. "
    "You are warm, brief, and specific. You never invent facts."
)


def _tool_schema(languages: list[str]) -> dict:
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
                        },
                        "required": ["headline", "body"],
                    }
                    for lang in languages
                },
                "required": languages,
            }
        },
        "required": ["nudges"],
    }


# Canned translations for offline mode. Kept generic — the exact category
# label is not translated per language here, just the framing.
_OFFLINE_TEMPLATES: dict[str, tuple[str, str]] = {
    "en": ("Fixed — thanks for reporting", "The {category} at {location} was resolved{took}. Your report helped."),
    "es": ("Resuelto — gracias por avisar", "Se resolvió el {category} en {location}{took}. Tu aviso ayudó."),
    "fr": ("Réglé — merci d'avoir signalé", "Le {category} à {location} a été résolu{took}. Merci pour votre signalement."),
    "ar": ("تم الحل — شكرًا للإبلاغ", "تم حل {category} عند {location}{took}. أفاد إبلاغك."),
    "pt": ("Resolvido — obrigado pelo aviso", "O {category} em {location} foi resolvido{took}. Seu aviso ajudou."),
    "ko": ("해결되었어요 — 신고해 주셔서 감사합니다", "{location}의 {category} 문제가 해결되었습니다{took}. 신고가 도움이 되었어요."),
}


async def _fan_reporters(
    session: AsyncSession, event_id: uuid.UUID
) -> list[User]:
    """Distinct fan users who reported this event (accounts only — device-only
    anon fans aren't reachable by user_id key)."""
    report_ids = (
        await session.execute(
            select(EventReport.report_id).where(EventReport.event_id == event_id)
        )
    ).scalars().all()
    if not report_ids:
        return []
    user_ids = (
        await session.execute(
            select(Report.source_user_id)
            .where(Report.id.in_(report_ids), Report.source_user_id.is_not(None))
            .distinct()
        )
    ).scalars().all()
    if not user_ids:
        return []
    users = (
        await session.execute(select(User).where(User.id.in_(user_ids), User.role == "fan"))
    ).scalars().all()
    return list(users)


def _offline_resolution(
    langs: list[str], category_id: str, location: str, took_min: int | None
) -> dict:
    out = {}
    took_str = f" (in {took_min} min)" if took_min is not None else ""
    for lang in langs:
        head, body_tmpl = _OFFLINE_TEMPLATES.get(lang, _OFFLINE_TEMPLATES["en"])
        cat_label = label(category_id, lang)
        out[lang] = {
            "headline": head,
            "body": body_tmpl.format(category=cat_label.lower(), location=location, took=took_str),
        }
    return {"nudges": out}


async def notify_resolved(
    session: AsyncSession, event: CanonicalEvent, note: str | None = None
) -> int:
    """Publish a per-language 'resolved' nudge to every fan who reported this event.

    Returns the number of nudges pushed onto the SSE bus.
    """
    reporters = await _fan_reporters(session, event.id)
    if not reporters:
        return 0

    langs = sorted({(u.language or "en") for u in reporters})
    ctx = await build_context(session, event.node_id, event.category)
    location = ctx.graph.nodes[event.node_id].name if event.node_id in ctx.graph.nodes \
        else event.node_id

    took_min: int | None = None
    if event.first_seen and event.resolved_at:
        took_min = max(0, int((event.resolved_at - event.first_seen).total_seconds() // 60))

    user_msg = json.dumps(
        {
            "event": {
                "category": event.category,
                "canonical_summary": event.canonical_summary,
                "location_name": location,
                "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
                "took_minutes": took_min,
                "note": note,
            },
            "audience": {"role": "fan", "languages": langs},
            "instructions": (
                "Produce one short 'resolved' nudge per requested language. Reassure the "
                "reporter their signal helped. Include ``took_minutes`` if present. Keep "
                "each nudge under 20 words. Do not invent details beyond the event summary."
            ),
        },
        ensure_ascii=False,
        indent=2,
    )

    result = await llm.call_reason(
        system_blocks=llm.system_with_cache(cached=ctx.cached_system(ROLE_INTRO)),
        user_message=user_msg,
        tool_name=TOOL_NAME,
        tool_schema=_tool_schema(langs),
        tool_description=TOOL_DESC,
        max_tokens=800,
    )
    if result is None:
        result = _offline_resolution(langs, event.category, location, took_min)

    nudges = result.get("nudges", {}) or {}
    pushed = 0
    for u in reporters:
        n = nudges.get(u.language or "en") or nudges.get("en")
        if not n:
            continue
        payload = {
            "event_id": str(event.id),
            "category": event.category,
            "node_id": event.node_id,
            "lang": u.language,
            "headline": n["headline"],
            "body": n["body"],
            "took_minutes": took_min,
            "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
        }
        bus.publish("fan", str(u.id), "fan.resolved", payload)
        pushed += 1

    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event.id,
            action=LedgerAction.NOTIFIED.value,
            payload={
                "kind": "loop_closure",
                "notified_fan_count": pushed,
                "languages": langs,
                "took_minutes": took_min,
                "at": datetime.now(UTC).isoformat(),
            },
        )
    )
    return pushed
