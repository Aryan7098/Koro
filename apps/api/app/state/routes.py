"""Read-only endpoints exposing venue state, the ledger, and metrics.

Kept here (not in ingress/) because they read the State layer defined in §1.4.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.fusion.venue_graph import load_graph
from app.models import CanonicalEvent, EventReport, Report, ResolutionLedger, VenueEdge, VenueNode
from app.rendering.pathplan import plan_reroute

router = APIRouter(prefix="/venue", tags=["state:venue"])


@router.get("/plan")
async def plan_route(
    session: Annotated[AsyncSession, Depends(get_session)],
    from_id: str,
    category: str = "wayfinding",
    avoid_id: str | None = None,
    mobility: bool = False,
    sensory: bool = False,
) -> dict:
    """Deterministic accessibility-aware Dijkstra reroute.

    Powers the control-panel path visualization and the FR8 demo beat: the
    same call the fan renderer makes, exposed as a diagnostic endpoint so
    reviewers can see the exact path (never invented, never LLM-generated).
    """
    graph = await load_graph(session)
    route = plan_reroute(
        graph,
        from_id=from_id,
        category=category,
        avoid_id=avoid_id,
        accessibility={"mobility": mobility, "sensory": sensory},
    )
    return {
        "from_id": route.from_id,
        "to_id": route.to_id,
        "node_path": route.node_path,
        "node_names": route.node_names,
        "distance_m": route.distance_m,
        "step_free": route.step_free,
        "low_stimulus": route.low_stimulus,
        "accessibility": route.accessibility,
        "reason": route.reason,
    }


@router.get("/graph")
async def venue_graph(session: Annotated[AsyncSession, Depends(get_session)]) -> dict:
    nodes = (await session.execute(select(VenueNode))).scalars().all()
    edges = (await session.execute(select(VenueEdge))).scalars().all()
    return {
        "nodes": [
            {
                "id": n.id,
                "name": n.name,
                "type": n.type,
                "lat": n.lat,
                "lng": n.lng,
                "level": n.level,
                "capacity": n.capacity,
                "step_free": n.step_free,
                "low_stimulus": n.low_stimulus,
                "is_open": n.is_open,
                "metadata": n.node_metadata,
            }
            for n in nodes
        ],
        "edges": [
            {
                "from": e.from_id,
                "to": e.to_id,
                "distance_m": e.distance_m,
                "step_free": e.step_free,
                "width_m": e.width_m,
                "low_stimulus": e.low_stimulus,
                "is_open": e.is_open,
            }
            for e in edges
        ],
    }


ledger_router = APIRouter(prefix="/events", tags=["state:events"])


@ledger_router.get("/{event_id}/lineage")
async def event_lineage(
    event_id: uuid.UUID, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict:
    """Traceability spine — Design Commitment #4.

    Returns every input report + every ledger entry that touched this event,
    so any rendered instruction can be traced back to its grounded evidence.
    """
    event = (
        await session.execute(select(CanonicalEvent).where(CanonicalEvent.id == event_id))
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")

    report_ids = (
        await session.execute(
            select(EventReport.report_id).where(EventReport.event_id == event_id)
        )
    ).scalars().all()

    reports = []
    if report_ids:
        rs = (
            await session.execute(select(Report).where(Report.id.in_(report_ids)))
        ).scalars().all()
        for r in rs:
            reports.append(
                {
                    "id": str(r.id),
                    "source": r.source,
                    "source_user_id": str(r.source_user_id) if r.source_user_id else None,
                    "device_fp": r.device_fp,
                    "raw_text": r.raw_text,
                    "raw_language": r.raw_language,
                    "category_hint": r.category_hint,
                    "node_hint": r.node_hint,
                    "normalized": r.normalized,
                    "confirm_value": r.confirm_value,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
            )

    ledger = (
        await session.execute(
            select(ResolutionLedger)
            .where(ResolutionLedger.event_id == event_id)
            .order_by(ResolutionLedger.created_at.asc())
        )
    ).scalars().all()

    return {
        "event": {
            "id": str(event.id),
            "node_id": event.node_id,
            "category": event.category,
            "severity": event.severity,
            "severity_reason": event.severity_reason,
            "confidence_band": event.confidence_band,
            "confidence_score": event.confidence_score,
            "status": event.status,
            "canonical_summary": event.canonical_summary,
            "first_seen": event.first_seen.isoformat() if event.first_seen else None,
            "last_seen": event.last_seen.isoformat() if event.last_seen else None,
            "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
            "source_mix": event.source_mix,
            "distinct_observers": event.distinct_observers,
        },
        "reports": reports,
        "ledger": [
            {
                "id": str(le.id),
                "action": le.action,
                "actor_user_id": str(le.actor_user_id) if le.actor_user_id else None,
                "report_ids": le.report_ids,
                "payload": le.payload,
                "notes": le.notes,
                "created_at": le.created_at.isoformat() if le.created_at else None,
            }
            for le in ledger
        ],
    }
