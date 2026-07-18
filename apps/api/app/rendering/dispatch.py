"""Rendering dispatcher — hand-off from the action gate.

Given (event, gate_result):
  1. Build a RenderContext (venue subset + SOP retrieval, cache-warm).
  2. Depending on the gate decision, call the appropriate renderer(s) and
     publish to the SSE bus for each affected audience.
  3. Log every rendered output to the ledger (Design Commitment #4).

Fan targeting:
  - We publish per-fan via ``bus.publish("fan", <user_id or device_fp>, ...)``.
  - For P0 we broadcast a nudge to *every* subscribed fan in the neighborhood;
    the frontend filters by "am I near this?". This keeps the dispatcher simple.

Staff/volunteer targeting:
  - Category ownership filtering (staff.category_ownership) + zone matching
    (volunteer.zone). Also broadcast to any user subscribed to the raw role.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.gate.decide import Decision, GateResult
from app.models import CanonicalEvent, ResolutionLedger, User
from app.models.ledger import LedgerAction
from app.realtime import bus
from app.rendering import fan as fan_render
from app.rendering import staff as staff_render
from app.rendering import volunteer as vol_render
from app.rendering.context import build_context


async def _subscribed_fan_users(session: AsyncSession) -> list[User]:
    return (
        await session.execute(select(User).where(User.role == "fan"))
    ).scalars().all()


async def _relevant_staff(session: AsyncSession, category: str) -> list[User]:
    staff = (
        await session.execute(select(User).where(User.role == "staff"))
    ).scalars().all()
    return [
        u for u in staff
        if not u.category_ownership or category in (u.category_ownership or [])
    ]


async def _relevant_volunteers(session: AsyncSession, node_id: str) -> list[User]:
    """For the hackathon: any volunteer is a candidate. Refined in M9 by zone."""
    return (
        await session.execute(select(User).where(User.role == "volunteer"))
    ).scalars().all()


def _log_render(session: AsyncSession, event: CanonicalEvent, audience: str,
                payload: dict[str, Any]) -> None:
    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event.id,
            action=LedgerAction.RENDERED.value,
            payload={"audience": audience, "content": payload},
        )
    )


async def dispatch_render(
    session: AsyncSession, event: CanonicalEvent, gate: GateResult
) -> None:
    if gate.decision == Decision.LOG:
        # No fan-out. But if the proposed action is volunteer_verify, still
        # push a verification prompt to volunteers.
        if gate.proposed_action.get("kind") == "volunteer_verify":
            await _render_volunteer(session, event, needs_verification=True)
        return

    ctx = await build_context(session, event.node_id, event.category)

    if gate.decision == Decision.SOFT_NUDGE:
        await _render_fan(session, ctx, event)
        return

    if gate.decision == Decision.DISPATCH_STAFF:
        await _render_fan(session, ctx, event)
        await _render_staff(session, ctx, event, priority=gate.proposed_action.get("priority",
                                                                                    "medium"))
        await _render_volunteer(session, event, needs_verification=False, ctx=ctx)
        return

    if gate.decision == Decision.REQUEST_HUMAN_AUTH:
        # Staff Authorize queue is materialized by the gate (PendingAuthorization row).
        # Publish an auth-request nudge to staff SSE so their UI updates immediately.
        payload = {
            "event_id": str(event.id),
            "category": event.category,
            "severity": event.severity,
            "band": event.confidence_band,
            "canonical_summary": event.canonical_summary,
            "source_mix": event.source_mix,
            "reasoning": gate.reasoning,
        }
        for staff_user in await _relevant_staff(session, event.category):
            bus.publish("staff", str(staff_user.id), "staff.auth_request", payload)
        bus.publish_role_broadcast("organizer", "organizer.auth_request", payload)
        _log_render(session, event, "staff.auth_request", payload)
        # For safety-critical events where fan messaging is allowed, still send
        # a calm nudge — but never for security/structural.
        if gate.proposed_action.get("fan_nudge_allowed", True):
            await _render_fan(session, ctx, event)
        return


# ---------- per-audience helpers -------------------------------------------


async def _render_fan(session: AsyncSession, ctx, event: CanonicalEvent) -> None:
    """Render fan nudges — batched by accessibility profile.

    Each unique accessibility profile is a separate Sonnet call requesting
    every language present in that group. Cuts the per-event LLM call count
    from N (fans) down to K (distinct profiles), typically 2-3.
    """
    fans = await _subscribed_fan_users(session)
    if not fans:
        return

    # Group by (mobility, sensory) — the only two flags we currently render for
    groups: dict[tuple[bool, bool], list] = {}
    for fan in fans:
        key = (
            bool((fan.accessibility_profile or {}).get("mobility")),
            bool((fan.accessibility_profile or {}).get("sensory")),
        )
        groups.setdefault(key, []).append(fan)

    for (mobility, sensory), members in groups.items():
        langs = sorted({(f.language or "en") for f in members})
        result = await fan_render.render_fan_nudge(
            ctx=ctx,
            event_summary=event.canonical_summary or "",
            band=event.confidence_band,
            severity=event.severity,
            source_mix=event.source_mix or {},
            languages=langs,
            accessibility={"mobility": mobility, "sensory": sensory},
        )
        if not result:
            continue
        nudges = result.get("nudges", {}) or {}
        for fan in members:
            nudge = nudges.get(fan.language or "en")
            if not nudge:
                # Fallback to English if this lang missing from the response
                nudge = nudges.get("en")
            if not nudge:
                continue
            payload = {
                "event_id": str(event.id),
                "category": event.category,
                "severity": event.severity,
                "band": event.confidence_band,
                "node_id": event.node_id,
                "lang": fan.language,
                **nudge,
            }
            bus.publish("fan", str(fan.id), "fan.nudge", payload)
            _log_render(session, event, f"fan:{fan.username}", payload)


async def _render_staff(
    session: AsyncSession, ctx, event: CanonicalEvent, priority: str = "medium"
) -> None:
    workorder = await staff_render.render_staff_workorder(
        ctx=ctx,
        event_summary=event.canonical_summary or "",
        band=event.confidence_band,
        severity=event.severity,
        source_mix=event.source_mix or {},
        reasoning=event.severity_reason,
    )
    if not workorder:
        return
    payload = {
        "event_id": str(event.id),
        "category": event.category,
        "severity": event.severity,
        "band": event.confidence_band,
        "node_id": event.node_id,
        "requested_priority": priority,
        **workorder,
    }
    for staff_user in await _relevant_staff(session, event.category):
        bus.publish("staff", str(staff_user.id), "staff.workorder", payload)
    _log_render(session, event, "staff.workorder", payload)


async def _render_volunteer(
    session: AsyncSession, event: CanonicalEvent, needs_verification: bool, ctx=None
) -> None:
    if ctx is None:
        ctx = await build_context(session, event.node_id, event.category)
    script = await vol_render.render_volunteer_script(
        ctx=ctx,
        event_summary=event.canonical_summary or "",
        band=event.confidence_band,
        severity=event.severity,
        needs_verification=needs_verification,
        source_mix=event.source_mix or {},
    )
    if not script:
        return
    payload = {
        "event_id": str(event.id),
        "category": event.category,
        "band": event.confidence_band,
        "severity": event.severity,
        "node_id": event.node_id,
        "needs_verification": needs_verification,
        **script,
    }
    for vol_user in await _relevant_volunteers(session, event.node_id):
        bus.publish("volunteer", str(vol_user.id), "volunteer.script", payload)
    _log_render(session, event, "volunteer.script", payload)
