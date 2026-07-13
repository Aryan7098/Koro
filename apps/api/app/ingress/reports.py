"""Report ingress — the four PRD §1.2 report classes.

Every endpoint has three responsibilities:
1. Persist a :class:`Report` row with source + trust context.
2. Enqueue on the Redis pending queue for the fusion tick.
3. Write a `report_ingested` ledger row so the traceability endpoint can
   reconstruct the full lineage.

All heavy lifting (normalize / cluster / trust / severity) happens later
in the fusion worker (Milestone 4). Ingress must stay sub-2s.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import current_user, require_role
from app.core.db import get_session
from app.ingress.queue import enqueue_report
from app.ingress.rate_limit import check_and_bump
from app.models import CanonicalEvent, Report, ResolutionLedger, User, VenueNode
from app.models.event import EventStatus
from app.models.ledger import LedgerAction
from app.models.report import ReportSource, ReportStatus

router = APIRouter(prefix="/reports", tags=["ingress:reports"])


# ---------- shared request/response models -----------------------------------


class ReportBody(BaseModel):
    text: str | None = Field(None, description="Free-text or transcribed voice")
    language: str | None = Field(None, description="ISO 639-1; auto-detect if None")
    category: str | None = Field(None, description="Optional user-selected category hint")
    node_hint: str | None = Field(None, description="Best guess venue_node.id")
    seat_hint: str | None = Field(None, description="e.g. 'Sec 112 Row K Seat 12'")
    media_ids: list[str] = Field(default_factory=list)
    device_context: dict = Field(default_factory=dict)


class ReportAck(BaseModel):
    report_id: uuid.UUID
    status: str
    message: str


class VolunteerReportBody(ReportBody):
    confirms_event_id: uuid.UUID | None = None
    confirm_value: str | None = Field(
        None, description='"confirm" | "deny" — set with confirms_event_id'
    )


class StaffReportBody(ReportBody):
    """Staff reports may also directly set state on facts they own."""

    state_set: dict | None = Field(
        None,
        description=(
            "Optional direct state mutation payload, e.g. "
            "{'kind': 'node_status', 'node_id': 'gate_c', 'is_open': false}. "
            "Only categories the acting user owns are honored."
        ),
    )


# ---------- helpers ----------------------------------------------------------


async def _persist_report(
    session: AsyncSession,
    source: ReportSource,
    body: ReportBody,
    user: User | None,
    device_fp: str | None,
    *,
    confirms_event_id: uuid.UUID | None = None,
    confirm_value: str | None = None,
) -> Report:
    if body.node_hint:
        node = (
            await session.execute(select(VenueNode).where(VenueNode.id == body.node_hint))
        ).scalar_one_or_none()
        if node is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"unknown node_hint: {body.node_hint}"
            )

    report = Report(
        id=uuid.uuid4(),
        source=source.value,
        source_user_id=user.id if user else None,
        device_fp=device_fp,
        raw_text=body.text,
        raw_language=body.language,
        category_hint=body.category,
        node_hint=body.node_hint,
        seat_hint=body.seat_hint,
        media_ids=body.media_ids,
        device_context=body.device_context,
        status=ReportStatus.PENDING.value,
        confirms_event_id=confirms_event_id,
        confirm_value=confirm_value,
    )
    session.add(report)
    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=confirms_event_id,
            action=LedgerAction.REPORT_INGESTED.value,
            actor_user_id=user.id if user else None,
            report_ids=[str(report.id)],
            payload={
                "source": source.value,
                "category_hint": body.category,
                "node_hint": body.node_hint,
                "language": body.language,
                "device_fp": device_fp,
                "confirm_value": confirm_value,
            },
        )
    )
    await session.commit()
    await enqueue_report(report.id)
    return report


def _rate_limit_key(user: User | None, device_fp: str | None) -> str:
    if user:
        return f"user:{user.id}"
    if device_fp:
        return f"device:{device_fp}"
    return "anon:unknown"


# ---------- endpoints --------------------------------------------------------


@router.post("/fan", response_model=ReportAck)
async def report_fan(
    body: ReportBody,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportAck:
    """Anonymous-capable fan report. Requires device_fp cookie from /auth/fan-session
    OR a bearer token for a T1 known fan."""
    user: User | None = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        # Optional bearer for known fans
        from app.auth.jwt import decode_token  # local import to avoid circular

        payload = decode_token(auth.split(" ", 1)[1])
        stmt = select(User).where(User.id == uuid.UUID(payload["sub"]))
        user = (await session.execute(stmt)).scalar_one_or_none()

    device_fp = request.cookies.get("echostand_fp")
    if not device_fp and not user:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "no fan session — call POST /auth/fan-session first",
        )

    await check_and_bump(_rate_limit_key(user, device_fp))

    report = await _persist_report(
        session, ReportSource.FAN, body, user=user, device_fp=device_fp
    )
    return ReportAck(
        report_id=report.id,
        status="queued",
        message="thanks — we're checking with others nearby",
    )


@router.post("/volunteer", response_model=ReportAck)
async def report_volunteer(
    body: VolunteerReportBody,
    user: Annotated[User, Depends(require_role("volunteer", "staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportAck:
    if bool(body.confirms_event_id) != bool(body.confirm_value):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "confirms_event_id and confirm_value must be provided together",
        )
    if body.confirm_value and body.confirm_value not in ("confirm", "deny"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            'confirm_value must be "confirm" or "deny"',
        )
    if body.confirms_event_id:
        exists = (
            await session.execute(
                select(CanonicalEvent).where(CanonicalEvent.id == body.confirms_event_id)
            )
        ).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "event not found")

    await check_and_bump(_rate_limit_key(user, None), limit=60)  # generous for staff/vol

    report = await _persist_report(
        session,
        ReportSource.VOLUNTEER,
        body,
        user=user,
        device_fp=None,
        confirms_event_id=body.confirms_event_id,
        confirm_value=body.confirm_value,
    )
    return ReportAck(report_id=report.id, status="queued", message="reported")


@router.post("/staff", response_model=ReportAck)
async def report_staff(
    body: StaffReportBody,
    user: Annotated[User, Depends(require_role("staff"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ReportAck:
    await check_and_bump(_rate_limit_key(user, None), limit=120)

    # Optional direct state mutation for facts staff own (§1.2)
    if body.state_set:
        kind = body.state_set.get("kind")
        if kind == "node_status":
            node_id = body.state_set.get("node_id")
            if not node_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "node_id required")
            node = (
                await session.execute(select(VenueNode).where(VenueNode.id == node_id))
            ).scalar_one_or_none()
            if node is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
            if "is_open" in body.state_set:
                node.is_open = bool(body.state_set["is_open"])
            session.add(
                ResolutionLedger(
                    id=uuid.uuid4(),
                    action=LedgerAction.STATE_SET.value,
                    actor_user_id=user.id,
                    payload={"kind": kind, "node_id": node_id, "changes": body.state_set},
                )
            )
        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"unsupported state_set.kind: {kind}"
            )

    report = await _persist_report(
        session, ReportSource.STAFF, body, user=user, device_fp=None
    )
    return ReportAck(report_id=report.id, status="queued", message="filed")


# ---------- read APIs (small — for the frontend to render live state) ---------


@router.get("/events/active")
async def list_active_events(
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 100,
) -> list[dict]:
    stmt = (
        select(CanonicalEvent)
        .where(CanonicalEvent.status.in_([EventStatus.OPEN.value, EventStatus.PENDING_AUTH.value,
                                          EventStatus.DISPATCHED.value]))
        .order_by(CanonicalEvent.last_seen.desc())
        .limit(limit)
    )
    events = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": str(e.id),
            "node_id": e.node_id,
            "category": e.category,
            "severity": e.severity,
            "confidence_band": e.confidence_band,
            "confidence_score": e.confidence_score,
            "status": e.status,
            "canonical_summary": e.canonical_summary,
            "first_seen": e.first_seen.isoformat() if e.first_seen else None,
            "last_seen": e.last_seen.isoformat() if e.last_seen else None,
            "source_mix": e.source_mix,
            "distinct_observers": e.distinct_observers,
        }
        for e in events
    ]
