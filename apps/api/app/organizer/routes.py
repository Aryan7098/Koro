"""Organizer analytics endpoints.

    GET /organizer/metrics   — headline numbers over the current window
                               (§3.8 success metrics).
    GET /organizer/patterns  — pattern-mined clusters from the resolution
                               ledger: category × node × recent count, so
                               organizers see emergent themes across a match.
    GET /organizer/live      — snapshot of active events with node coordinates
                               folded in, for the frontend venue-map overlay.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import require_role
from app.core.db import get_session
from app.models import CanonicalEvent, PendingAuthorization, ResolutionLedger, User, VenueNode
from app.models.event import AuthStatus, EventStatus
from app.models.ledger import LedgerAction

router = APIRouter(prefix="/organizer", tags=["organizer"])


@router.get("/metrics")
async def metrics(
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    now = datetime.now(UTC)
    window_start = now - timedelta(hours=6)

    total_events = (
        await session.execute(
            select(func.count()).select_from(CanonicalEvent).where(
                CanonicalEvent.first_seen >= window_start
            )
        )
    ).scalar_one()
    resolved = (
        await session.execute(
            select(func.count()).select_from(CanonicalEvent).where(
                CanonicalEvent.status == EventStatus.RESOLVED.value,
                CanonicalEvent.resolved_at >= window_start,
            )
        )
    ).scalar_one()
    dismissed = (
        await session.execute(
            select(func.count()).select_from(CanonicalEvent).where(
                CanonicalEvent.status == EventStatus.DISMISSED.value,
                CanonicalEvent.last_seen >= window_start,
            )
        )
    ).scalar_one()
    open_now = (
        await session.execute(
            select(func.count()).select_from(CanonicalEvent).where(
                CanonicalEvent.status.in_(
                    [
                        EventStatus.OPEN.value,
                        EventStatus.PENDING_AUTH.value,
                        EventStatus.DISPATCHED.value,
                    ]
                )
            )
        )
    ).scalar_one()
    pending_auth = (
        await session.execute(
            select(func.count()).select_from(PendingAuthorization).where(
                PendingAuthorization.status == AuthStatus.PENDING.value
            )
        )
    ).scalar_one()

    # Loop-closure delivered count over the window
    notified_rows = (
        await session.execute(
            select(ResolutionLedger).where(
                ResolutionLedger.action == LedgerAction.NOTIFIED.value,
                ResolutionLedger.created_at >= window_start,
            )
        )
    ).scalars().all()
    notifications = sum(
        int((r.payload or {}).get("notified_fan_count") or 0) for r in notified_rows
    )

    # Time-to-confirmed — for events that transitioned to CONFIRMED, how long from
    # first_seen. Approximated from EVENT_UPDATED ledger entries.
    upds = (
        await session.execute(
            select(ResolutionLedger).where(
                ResolutionLedger.action == LedgerAction.EVENT_UPDATED.value,
                ResolutionLedger.created_at >= window_start,
            )
        )
    ).scalars().all()

    ttc_seconds: list[float] = []
    first_confirm_by_event: dict[str, datetime] = {}
    for row in upds:
        if (row.payload or {}).get("band") == "CONFIRMED" and row.event_id:
            key = str(row.event_id)
            if key not in first_confirm_by_event:
                first_confirm_by_event[key] = row.created_at

    if first_confirm_by_event:
        events_by_id = {
            str(e.id): e
            for e in (
                await session.execute(
                    select(CanonicalEvent).where(
                        CanonicalEvent.id.in_(list(first_confirm_by_event.keys()))
                    )
                )
            )
            .scalars()
            .all()
        }
        for eid, confirmed_at in first_confirm_by_event.items():
            ev = events_by_id.get(eid)
            if ev and ev.first_seen:
                ttc_seconds.append((confirmed_at - ev.first_seen).total_seconds())

    avg_ttc = sum(ttc_seconds) / len(ttc_seconds) if ttc_seconds else None

    # Manipulation-suppression: events that stayed RUMOR despite ≥5 observers
    suppressed = (
        await session.execute(
            select(func.count()).select_from(CanonicalEvent).where(
                CanonicalEvent.confidence_band == "RUMOR",
                CanonicalEvent.distinct_observers >= 5,
                CanonicalEvent.last_seen >= window_start,
            )
        )
    ).scalar_one()

    return {
        "window_hours": 6,
        "events_seen": total_events,
        "events_open": open_now,
        "events_resolved": resolved,
        "events_dismissed": dismissed,
        "pending_authorizations": pending_auth,
        "loop_closure_notifications": notifications,
        "avg_time_to_confirmed_seconds": avg_ttc,
        "manipulation_suppressed": suppressed,
    }


@router.get("/patterns")
async def patterns(
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    hours: int = 6,
) -> list[dict]:
    """Group events by (category, node) with counts and average severity — the
    kind of thing an organizer wants to see after a match. Ordered by count DESC."""
    since = datetime.now(UTC) - timedelta(hours=hours)
    events = (
        await session.execute(
            select(CanonicalEvent).where(CanonicalEvent.first_seen >= since)
        )
    ).scalars().all()

    sev_score = {"LOW": 1, "MED": 2, "HIGH": 3, "CRITICAL": 4}
    buckets: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"count": 0, "sev_sum": 0, "resolved": 0, "band_confirmed": 0}
    )
    for e in events:
        key = (e.category, e.node_id)
        b = buckets[key]
        b["count"] += 1
        b["sev_sum"] += sev_score.get(e.severity, 0)
        if e.status == EventStatus.RESOLVED.value:
            b["resolved"] += 1
        if e.confidence_band == "CONFIRMED":
            b["band_confirmed"] += 1

    result = []
    for (category, node_id), b in buckets.items():
        avg = b["sev_sum"] / b["count"] if b["count"] else 0.0
        result.append(
            {
                "category": category,
                "node_id": node_id,
                "count": b["count"],
                "resolved": b["resolved"],
                "confirmed": b["band_confirmed"],
                "avg_severity_score": round(avg, 2),
            }
        )
    result.sort(key=lambda r: r["count"], reverse=True)
    return result


@router.get("/live")
async def live(
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Active events + venue node coordinates for the frontend venue-map overlay."""
    nodes = (await session.execute(select(VenueNode))).scalars().all()
    events = (
        await session.execute(
            select(CanonicalEvent).where(
                CanonicalEvent.status.in_(
                    [
                        EventStatus.OPEN.value,
                        EventStatus.PENDING_AUTH.value,
                        EventStatus.DISPATCHED.value,
                    ]
                )
            )
        )
    ).scalars().all()
    return {
        "nodes": [
            {
                "id": n.id, "name": n.name, "type": n.type,
                "lat": n.lat, "lng": n.lng, "level": n.level,
                "is_open": n.is_open,
            }
            for n in nodes
        ],
        "events": [
            {
                "id": str(e.id), "node_id": e.node_id, "category": e.category,
                "severity": e.severity, "confidence_band": e.confidence_band,
                "status": e.status, "distinct_observers": e.distinct_observers,
                "canonical_summary": e.canonical_summary,
            }
            for e in events
        ],
    }
