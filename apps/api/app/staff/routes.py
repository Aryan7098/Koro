"""Staff console endpoints.

Three tabs on the frontend map to three read endpoints here, plus three
write endpoints for approve / deny / resolve:

    GET  /staff/queue         — dispatch queue (open + dispatched events in my categories)
    GET  /staff/authorize     — pending FR11 authorizations with evidence
    GET  /staff/resolve       — engaged events awaiting resolution

    POST /staff/authorize/{id}/approve   — approve, fire dispatch, mark event dispatched
    POST /staff/authorize/{id}/deny      — dismiss with reason
    POST /staff/events/{id}/resolve      — mark resolved, kick loop-closure (M11)

Every write logs to the ledger and publishes to the appropriate SSE channels.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import require_role
from app.core.db import get_session
from app.gate.decide import Decision, GateResult
from app.models import CanonicalEvent, PendingAuthorization, ResolutionLedger, User
from app.models.event import AuthStatus, EventStatus
from app.models.ledger import LedgerAction
from app.realtime import bus

router = APIRouter(prefix="/staff", tags=["staff"])


# ---------- helpers -------------------------------------------------------


def _owned_categories(user: User) -> list[str] | None:
    """Return the categories this staff user owns, or None to mean 'all'."""
    return user.category_ownership or None


def _event_to_dict(e: CanonicalEvent) -> dict:
    return {
        "id": str(e.id),
        "node_id": e.node_id,
        "category": e.category,
        "severity": e.severity,
        "confidence_band": e.confidence_band,
        "confidence_score": e.confidence_score,
        "status": e.status,
        "canonical_summary": e.canonical_summary,
        "severity_reason": e.severity_reason,
        "source_mix": e.source_mix,
        "distinct_observers": e.distinct_observers,
        "first_seen": e.first_seen.isoformat() if e.first_seen else None,
        "last_seen": e.last_seen.isoformat() if e.last_seen else None,
        "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
    }


# ---------- read endpoints ------------------------------------------------


@router.get("/queue")
async def dispatch_queue(
    user: Annotated[User, Depends(require_role("staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """Dispatched or open events in this staff user's owned categories, sorted
    by (severity, confidence_band, last_seen)."""
    stmt = (
        select(CanonicalEvent)
        .where(
            CanonicalEvent.status.in_(
                [EventStatus.OPEN.value, EventStatus.DISPATCHED.value]
            )
        )
        .order_by(desc(CanonicalEvent.last_seen))
        .limit(200)
    )
    events = (await session.execute(stmt)).scalars().all()
    owned = _owned_categories(user)
    if owned:
        events = [e for e in events if e.category in owned]

    # Sort in Python by severity and confidence for stable UI order
    sev_order = {"CRITICAL": 0, "HIGH": 1, "MED": 2, "LOW": 3}
    band_order = {"CONFIRMED": 0, "PROBABLE": 1, "RUMOR": 2}
    events.sort(key=lambda e: (sev_order.get(e.severity, 9),
                               band_order.get(e.confidence_band, 9)))
    return [_event_to_dict(e) for e in events]


@router.get("/authorize")
async def authorize_queue(
    user: Annotated[User, Depends(require_role("staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """PendingAuthorization rows in status=pending, with the linked event.

    Ordered by severity: CRITICAL/HIGH first so the human eye lands on them.
    """
    stmt = (
        select(PendingAuthorization, CanonicalEvent)
        .join(CanonicalEvent, CanonicalEvent.id == PendingAuthorization.event_id)
        .where(PendingAuthorization.status == AuthStatus.PENDING.value)
        .order_by(desc(PendingAuthorization.created_at))
        .limit(100)
    )
    rows = (await session.execute(stmt)).all()

    owned = _owned_categories(user)
    result = []
    sev_order = {"CRITICAL": 0, "HIGH": 1, "MED": 2, "LOW": 3}
    for auth, event in rows:
        if owned and event.category not in owned:
            continue
        result.append(
            {
                "auth_id": str(auth.id),
                "created_at": auth.created_at.isoformat() if auth.created_at else None,
                "proposed_action": auth.proposed_action,
                "evidence": auth.evidence,
                "event": _event_to_dict(event),
            }
        )
    result.sort(key=lambda r: sev_order.get(r["event"]["severity"], 9))
    return result


@router.get("/resolve")
async def resolve_queue(
    user: Annotated[User, Depends(require_role("staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[dict]:
    """Events that are engaged (dispatched / pending_auth) and awaiting resolve."""
    stmt = (
        select(CanonicalEvent)
        .where(
            CanonicalEvent.status.in_(
                [EventStatus.DISPATCHED.value, EventStatus.PENDING_AUTH.value]
            )
        )
        .order_by(desc(CanonicalEvent.last_seen))
        .limit(200)
    )
    events = (await session.execute(stmt)).scalars().all()
    owned = _owned_categories(user)
    if owned:
        events = [e for e in events if e.category in owned]
    return [_event_to_dict(e) for e in events]


# ---------- write endpoints -----------------------------------------------


class DecisionBody(BaseModel):
    reason: str | None = None


@router.post("/authorize/{auth_id}/approve")
async def approve_authorization(
    auth_id: uuid.UUID,
    body: DecisionBody,
    user: Annotated[User, Depends(require_role("staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    auth = (
        await session.execute(
            select(PendingAuthorization).where(PendingAuthorization.id == auth_id)
        )
    ).scalar_one_or_none()
    if auth is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "authorization not found")
    if auth.status != AuthStatus.PENDING.value:
        raise HTTPException(status.HTTP_409_CONFLICT, f"already {auth.status}")

    event = (
        await session.execute(
            select(CanonicalEvent).where(CanonicalEvent.id == auth.event_id)
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event vanished")

    auth.status = AuthStatus.APPROVED.value
    auth.decided_by = user.id
    auth.decision_reason = body.reason
    auth.decided_at = datetime.now(UTC)

    event.status = EventStatus.DISPATCHED.value

    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event.id,
            action=LedgerAction.AUTH_APPROVED.value,
            actor_user_id=user.id,
            payload={"auth_id": str(auth.id), "proposed_action": auth.proposed_action,
                     "reason": body.reason},
        )
    )
    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event.id,
            action=LedgerAction.DISPATCHED.value,
            actor_user_id=user.id,
            payload={"via": "human_authorization", "proposed_action": auth.proposed_action},
        )
    )

    # Fire the rendering pipeline as if the gate had emitted DISPATCH_STAFF —
    # staff work-order + volunteer script + fan guidance all go out now.
    fake_gate = GateResult(
        decision=Decision.DISPATCH_STAFF,
        reasoning=f"authorized by {user.username}",
        proposed_action=auth.proposed_action,
        next_status=EventStatus.DISPATCHED.value,
    )
    try:
        from app.rendering.dispatch import dispatch_render

        await dispatch_render(session, event, fake_gate)
    except Exception as e:  # pragma: no cover — degrade gracefully
        session.add(
            ResolutionLedger(
                id=uuid.uuid4(),
                event_id=event.id,
                action=LedgerAction.AUTH_APPROVED.value,
                notes=f"render dispatch failed: {e}",
            )
        )

    await session.commit()
    return {"auth_id": str(auth.id), "status": auth.status, "event_status": event.status}


@router.post("/authorize/{auth_id}/deny")
async def deny_authorization(
    auth_id: uuid.UUID,
    body: DecisionBody,
    user: Annotated[User, Depends(require_role("staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    auth = (
        await session.execute(
            select(PendingAuthorization).where(PendingAuthorization.id == auth_id)
        )
    ).scalar_one_or_none()
    if auth is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "authorization not found")
    if auth.status != AuthStatus.PENDING.value:
        raise HTTPException(status.HTTP_409_CONFLICT, f"already {auth.status}")

    event = (
        await session.execute(
            select(CanonicalEvent).where(CanonicalEvent.id == auth.event_id)
        )
    ).scalar_one_or_none()

    auth.status = AuthStatus.DENIED.value
    auth.decided_by = user.id
    auth.decision_reason = body.reason
    auth.decided_at = datetime.now(UTC)

    if event is not None:
        event.status = EventStatus.DISMISSED.value

    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=auth.event_id,
            action=LedgerAction.AUTH_DENIED.value,
            actor_user_id=user.id,
            payload={"auth_id": str(auth.id), "reason": body.reason},
        )
    )
    await session.commit()
    return {"auth_id": str(auth.id), "status": auth.status}


@router.post("/events/{event_id}/resolve")
async def resolve_event(
    event_id: uuid.UUID,
    body: DecisionBody,
    user: Annotated[User, Depends(require_role("staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    event = (
        await session.execute(select(CanonicalEvent).where(CanonicalEvent.id == event_id))
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    if event.status == EventStatus.RESOLVED.value:
        raise HTTPException(status.HTTP_409_CONFLICT, "already resolved")

    event.status = EventStatus.RESOLVED.value
    event.resolved_at = datetime.now(UTC)

    # Also close any still-pending authorizations for this event
    pending = (
        await session.execute(
            select(PendingAuthorization).where(
                PendingAuthorization.event_id == event_id,
                PendingAuthorization.status == AuthStatus.PENDING.value,
            )
        )
    ).scalars().all()
    for p in pending:
        p.status = AuthStatus.APPROVED.value
        p.decided_by = user.id
        p.decision_reason = "auto-closed on event resolve"
        p.decided_at = datetime.now(UTC)

    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event.id,
            action=LedgerAction.RESOLVED.value,
            actor_user_id=user.id,
            payload={"reason": body.reason},
        )
    )

    # Notify staff/organizer channels so their UIs refresh; loop-closure to
    # fans lands in Milestone 11.
    payload = {"event_id": str(event.id), "category": event.category, "node_id": event.node_id}
    bus.publish_role_broadcast("staff", "event.resolved", payload)
    bus.publish_role_broadcast("organizer", "event.resolved", payload)

    await session.commit()
    return {"event_id": str(event.id), "status": event.status,
            "resolved_at": event.resolved_at.isoformat()}
