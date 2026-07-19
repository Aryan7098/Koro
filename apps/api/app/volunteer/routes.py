"""Volunteer endpoints.

Volunteers already have a confirm/deny path through /reports/volunteer, so this
module is deliberately thin:

    GET  /volunteer/tasks     — verify queue: open events at Rumor/Probable
                                confidence that the gate flagged for verification.
    GET  /volunteer/scripts   — recent volunteer scripts pulled from the ledger,
                                so a volunteer joining mid-match sees context.
    POST /volunteer/confirm   — thin alias over /reports/volunteer for the
                                verify buttons in the UI.
    POST /volunteer/deny      — same, deny direction.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import require_role
from app.core.db import get_session
from app.ingress.queue import enqueue_report
from app.models import CanonicalEvent, ResolutionLedger, User
from app.models.event import EventStatus
from app.models.ledger import LedgerAction
from app.models.report import Report, ReportSource, ReportStatus

router = APIRouter(prefix="/volunteer", tags=["volunteer"])


@router.get("/tasks")
async def verify_tasks(
    _: Annotated[User, Depends(require_role("volunteer", "staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Two lists for the volunteer surface:

    - ``verify``: open RUMOR/PROBABLE events waiting for a human to confirm.
    - ``active``: DISPATCHED events (staff has taken ownership, volunteer
      needs to walk over, act on it, and submit completion evidence).
    - ``completion_evidence``: per event_id, whether a completion Report
      has already been filed (so the UI can grey-out already-completed items).
    """
    verify_stmt = (
        select(CanonicalEvent)
        .where(
            CanonicalEvent.status == EventStatus.OPEN.value,
            CanonicalEvent.confidence_band.in_(["RUMOR", "PROBABLE"]),
        )
        .order_by(desc(CanonicalEvent.last_seen))
        .limit(50)
    )
    active_stmt = (
        select(CanonicalEvent)
        .where(CanonicalEvent.status == EventStatus.DISPATCHED.value)
        .order_by(desc(CanonicalEvent.last_seen))
        .limit(50)
    )
    verify_events = (await session.execute(verify_stmt)).scalars().all()
    active_events = (await session.execute(active_stmt)).scalars().all()

    active_ids = [e.id for e in active_events]
    completion_map: dict[str, dict] = {}
    if active_ids:
        # A "completion evidence" report is confirm_value='complete' linked to
        # the event via confirms_event_id.
        stmt = (
            select(Report)
            .where(
                Report.confirms_event_id.in_(active_ids),
                Report.confirm_value == "complete",
            )
            .order_by(desc(Report.created_at))
        )
        completion_reports = (await session.execute(stmt)).scalars().all()
        for r in completion_reports:
            key = str(r.confirms_event_id)
            completion_map.setdefault(key, {"count": 0, "latest_text": None,
                                             "latest_at": None, "media_ids": []})
            completion_map[key]["count"] += 1
            if completion_map[key]["latest_text"] is None:
                completion_map[key]["latest_text"] = r.raw_text
                completion_map[key]["latest_at"] = (
                    r.created_at.isoformat() if r.created_at else None
                )
                completion_map[key]["media_ids"] = list(r.media_ids or [])

    def dictify(e: CanonicalEvent) -> dict:
        return {
            "id": str(e.id),
            "node_id": e.node_id,
            "category": e.category,
            "severity": e.severity,
            "confidence_band": e.confidence_band,
            "status": e.status,
            "canonical_summary": e.canonical_summary,
            "distinct_observers": e.distinct_observers,
            "source_mix": e.source_mix,
            "first_seen": e.first_seen.isoformat() if e.first_seen else None,
            "last_seen": e.last_seen.isoformat() if e.last_seen else None,
            "completion": completion_map.get(str(e.id)),
        }

    return {
        "verify": [dictify(e) for e in verify_events],
        "active": [dictify(e) for e in active_events],
    }


class CompleteBody(BaseModel):
    text: str
    media_ids: list[str] = []


@router.post("/events/{event_id}/complete")
async def submit_completion(
    event_id: uuid.UUID,
    body: CompleteBody,
    user: Annotated[User, Depends(require_role("volunteer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Volunteer submits proof-of-completion for a dispatched task.

    Creates a Report (source=volunteer, confirm_value='complete',
    confirms_event_id=event.id, raw_text=proof, media_ids=photos).
    Staff sees this in the Resolve tab; only after staff verifies does the
    loop-closure fan notification fire (POST /staff/events/{id}/resolve).
    """
    if not body.text or len(body.text.strip()) < 5:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "please describe what you saw / did (at least a few words)",
        )

    ev = (
        await session.execute(select(CanonicalEvent).where(CanonicalEvent.id == event_id))
    ).scalar_one_or_none()
    if ev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")
    if ev.status not in (EventStatus.DISPATCHED.value, EventStatus.OPEN.value):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"cannot submit completion when event.status={ev.status}",
        )

    report = Report(
        id=uuid.uuid4(),
        source=ReportSource.VOLUNTEER.value,
        source_user_id=user.id,
        device_fp=None,
        raw_text=body.text.strip(),
        raw_language="en",
        category_hint=ev.category,
        node_hint=ev.node_id,
        media_ids=body.media_ids or [],
        device_context={},
        status=ReportStatus.PENDING.value,
        confirms_event_id=event_id,
        confirm_value="complete",
    )
    session.add(report)
    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event_id,
            action=LedgerAction.REPORT_INGESTED.value,
            actor_user_id=user.id,
            report_ids=[str(report.id)],
            payload={
                "source": "volunteer",
                "confirm_value": "complete",
                "text": body.text.strip(),
                "media_count": len(body.media_ids or []),
                "volunteer_username": user.username,
            },
        )
    )
    await session.commit()
    await enqueue_report(report.id)

    # Ping staff SSE bus so their Resolve tab refreshes
    from app.realtime import bus

    bus.publish_role_broadcast(
        "staff",
        "event.completion",
        {
            "event_id": str(event_id),
            "volunteer": user.display_name or user.username,
            "text": body.text.strip(),
        },
    )
    bus.publish_role_broadcast(
        "organizer",
        "event.completion",
        {"event_id": str(event_id), "volunteer": user.display_name or user.username},
    )

    return {
        "report_id": str(report.id),
        "event_id": str(event_id),
        "status": "submitted",
        "message": "Thanks — staff will verify and notify the fans who reported.",
    }


@router.get("/scripts")
async def recent_scripts(
    _: Annotated[User, Depends(require_role("volunteer", "staff", "organizer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 20,
) -> list[dict]:
    """Recent volunteer scripts from the ledger. For a volunteer arriving
    mid-match — otherwise the SSE stream is the live source of truth."""
    stmt = (
        select(ResolutionLedger)
        .where(
            ResolutionLedger.action == LedgerAction.RENDERED.value,
        )
        .order_by(desc(ResolutionLedger.created_at))
        .limit(limit * 4)  # over-fetch and filter by audience
    )
    rows = (await session.execute(stmt)).scalars().all()
    scripts = []
    for row in rows:
        payload = row.payload or {}
        if payload.get("audience") != "volunteer.script":
            continue
        content = payload.get("content", {})
        scripts.append(
            {
                "event_id": content.get("event_id"),
                "category": content.get("category"),
                "severity": content.get("severity"),
                "band": content.get("band"),
                "node_id": content.get("node_id"),
                "needs_verification": content.get("needs_verification", False),
                "verify_prompt": content.get("verify_prompt"),
                "do": content.get("do", []),
                "say": content.get("say"),
                "at": row.created_at.isoformat() if row.created_at else None,
            }
        )
        if len(scripts) >= limit:
            break
    return scripts


class ConfirmBody(BaseModel):
    event_id: uuid.UUID
    note: str | None = None


async def _persist_confirm(
    session: AsyncSession, user: User, event_id: uuid.UUID, confirm_value: str, note: str | None
) -> Report:
    ev = (
        await session.execute(select(CanonicalEvent).where(CanonicalEvent.id == event_id))
    ).scalar_one_or_none()
    if ev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")

    report = Report(
        id=uuid.uuid4(),
        source=ReportSource.VOLUNTEER.value,
        source_user_id=user.id,
        device_fp=None,
        raw_text=note or ("confirmed" if confirm_value == "confirm" else "denied"),
        raw_language="en",
        category_hint=ev.category,
        node_hint=ev.node_id,
        media_ids=[],
        device_context={},
        status=ReportStatus.PENDING.value,
        confirms_event_id=event_id,
        confirm_value=confirm_value,
    )
    session.add(report)
    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event_id,
            action=LedgerAction.REPORT_INGESTED.value,
            actor_user_id=user.id,
            report_ids=[str(report.id)],
            payload={"source": "volunteer", "confirm_value": confirm_value, "note": note},
        )
    )
    await session.commit()
    await enqueue_report(report.id)
    return report


@router.post("/confirm")
async def confirm(
    body: ConfirmBody,
    user: Annotated[User, Depends(require_role("volunteer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    report = await _persist_confirm(session, user, body.event_id, "confirm", body.note)
    return {"report_id": str(report.id), "action": "confirm"}


@router.post("/deny")
async def deny(
    body: ConfirmBody,
    user: Annotated[User, Depends(require_role("volunteer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    report = await _persist_confirm(session, user, body.event_id, "deny", body.note)
    return {"report_id": str(report.id), "action": "deny"}
