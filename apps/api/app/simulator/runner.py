"""Scenario runner — drives reports/signals into the ingress layer.

Design: bypass the HTTP ingress and go straight through the same helpers the
routes use (``_persist_report`` / ``enqueue_passive``). This keeps the simulator
deterministic and independent of auth/rate-limiting; it still exercises the
full fusion → gate → rendering path since it writes to the same tables and
queues.

State model:
    ``RunnerState`` lives in-process. A single scenario runs at a time; the
    /simulator/stop endpoint cancels the asyncio.Task.
"""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select

from app.core.db import SessionLocal
from app.ingress.queue import enqueue_passive, enqueue_report
from app.ingress.reports import ReportBody, VolunteerReportBody, _persist_report
from app.models import CanonicalEvent, ResolutionLedger, User, VenueNode
from app.models.event import EventStatus
from app.models.ledger import LedgerAction
from app.models.report import ReportSource


@dataclass
class RunnerState:
    task: asyncio.Task | None = None
    scenario_name: str | None = None
    started_at: datetime | None = None
    steps_total: int = 0
    steps_completed: int = 0
    last_error: str | None = None
    log: list[dict] = field(default_factory=list)


STATE = RunnerState()


def _sim_device_fp(seed: str) -> str:
    """Derive a stable synthetic device fingerprint for a simulator persona.

    Personas listed in scenarios use short names ("fan_a", "fan_b", ...); we
    hash them so independence counting sees distinct fingerprints per persona
    but the same fingerprint if a persona reports twice (spam case).
    """
    return "sim_" + hashlib.sha256(seed.encode()).hexdigest()[:20]


async def _find_user(session, username: str) -> User | None:
    return (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()


async def _step_fan_report(payload: dict) -> dict:
    persona = payload.get("persona", "sim_anon")
    body = ReportBody(
        text=payload.get("text"),
        language=payload.get("language"),
        category=payload.get("category"),
        node_hint=payload.get("node_id"),
        seat_hint=payload.get("seat_hint"),
        media_ids=payload.get("media_ids", []),
        device_context=payload.get("device_context", {}),
    )
    async with SessionLocal() as session:
        # Optional known-fan attachment
        user: User | None = None
        if username := payload.get("username"):
            user = await _find_user(session, username)
        report = await _persist_report(
            session=session,
            source=ReportSource.FAN,
            body=body,
            user=user,
            device_fp=_sim_device_fp(persona),
        )
    return {"report_id": str(report.id), "persona": persona}


async def _step_volunteer_report(payload: dict) -> dict:
    async with SessionLocal() as session:
        user = await _find_user(session, payload.get("username", "vol_north"))
        if user is None:
            raise ValueError(f"volunteer username not found: {payload.get('username')}")
        body = VolunteerReportBody(
            text=payload.get("text"),
            language=payload.get("language"),
            category=payload.get("category"),
            node_hint=payload.get("node_id"),
        )
        report = await _persist_report(
            session=session,
            source=ReportSource.VOLUNTEER,
            body=body,
            user=user,
            device_fp=None,
        )
    return {"report_id": str(report.id), "username": user.username}


async def _step_volunteer_confirm(payload: dict, *, deny: bool = False) -> dict:
    """Volunteer confirms or denies a live event."""
    async with SessionLocal() as session:
        user = await _find_user(session, payload.get("username", "vol_north"))
        if user is None:
            raise ValueError(f"volunteer username not found: {payload.get('username')}")

        # Resolve event: either explicit id, or hint by (node_id, category)
        event_id: uuid.UUID | None = None
        if raw := payload.get("event_id"):
            event_id = uuid.UUID(raw)
        else:
            stmt = (
                select(CanonicalEvent)
                .where(
                    CanonicalEvent.node_id == payload["node_id"],
                    CanonicalEvent.category == payload["category"],
                    CanonicalEvent.status.in_(
                        [EventStatus.OPEN.value, EventStatus.PENDING_AUTH.value,
                         EventStatus.DISPATCHED.value]
                    ),
                )
                .order_by(desc(CanonicalEvent.last_seen))
                .limit(1)
            )
            event = (await session.execute(stmt)).scalars().first()
            if event is None:
                return {"skipped": "no matching open event"}
            event_id = event.id

        body = VolunteerReportBody(
            text=payload.get("text", "confirmed" if not deny else "denied"),
            language="en",
            category=payload.get("category"),
            node_hint=payload.get("node_id"),
            confirms_event_id=event_id,
            confirm_value="deny" if deny else "confirm",
        )
        report = await _persist_report(
            session=session,
            source=ReportSource.VOLUNTEER,
            body=body,
            user=user,
            device_fp=None,
            confirms_event_id=event_id,
            confirm_value=body.confirm_value,
        )
    return {"report_id": str(report.id), "event_id": str(event_id), "action": body.confirm_value}


async def _step_staff_report(payload: dict) -> dict:
    async with SessionLocal() as session:
        user = await _find_user(session, payload.get("username", "staff_ops"))
        if user is None:
            raise ValueError(f"staff username not found: {payload.get('username')}")
        body = ReportBody(
            text=payload.get("text"),
            category=payload.get("category"),
            node_hint=payload.get("node_id"),
            language="en",
        )
        report = await _persist_report(
            session=session,
            source=ReportSource.STAFF,
            body=body,
            user=user,
            device_fp=None,
        )
    return {"report_id": str(report.id)}


async def _step_staff_state_set(payload: dict) -> dict:
    """Direct node-status flip via the ledger (mirrors staff /state_set path)."""
    async with SessionLocal() as session:
        node_id = payload["node_id"]
        node = (
            await session.execute(select(VenueNode).where(VenueNode.id == node_id))
        ).scalar_one_or_none()
        if node is None:
            raise ValueError(f"unknown node: {node_id}")
        if "is_open" in payload:
            node.is_open = bool(payload["is_open"])
        session.add(
            ResolutionLedger(
                id=uuid.uuid4(),
                action=LedgerAction.STATE_SET.value,
                payload={"kind": "node_status", "node_id": node_id, "changes": payload},
                notes="simulator",
            )
        )
        await session.commit()
    return {"node_id": node_id, "changes": payload}


async def _step_passive_signal(payload: dict) -> dict:
    payload = dict(payload)
    payload.setdefault("ts", datetime.now(UTC).isoformat())
    await enqueue_passive(payload)
    return {"queued": payload}


STEP_HANDLERS = {
    "fan_report": _step_fan_report,
    "volunteer_report": _step_volunteer_report,
    "volunteer_confirm": lambda p: _step_volunteer_confirm(p, deny=False),
    "volunteer_deny": lambda p: _step_volunteer_confirm(p, deny=True),
    "staff_report": _step_staff_report,
    "staff_state_set": _step_staff_state_set,
    "passive_signal": _step_passive_signal,
}


async def _run_scenario(scenario: dict) -> None:
    STATE.log.clear()
    STATE.steps_total = len(scenario["steps"])
    STATE.steps_completed = 0
    STATE.last_error = None
    STATE.scenario_name = scenario["name"]
    STATE.started_at = datetime.now(UTC)

    try:
        elapsed = 0
        for i, step in enumerate(scenario["steps"]):
            wait_ms = max(0, step["delay_ms"] - elapsed)
            if wait_ms:
                await asyncio.sleep(wait_ms / 1000.0)
            elapsed = step["delay_ms"]

            handler = STEP_HANDLERS.get(step["kind"])
            if not handler:
                raise ValueError(f"no handler for kind {step['kind']}")
            try:
                result = await handler(step["payload"])
                STATE.log.append(
                    {
                        "i": i,
                        "kind": step["kind"],
                        "at_ms": elapsed,
                        "result": result,
                        "ts": datetime.now(UTC).isoformat(),
                    }
                )
            except Exception as e:
                STATE.log.append(
                    {"i": i, "kind": step["kind"], "error": str(e),
                     "ts": datetime.now(UTC).isoformat()}
                )
                STATE.last_error = str(e)
            STATE.steps_completed = i + 1
    except asyncio.CancelledError:
        STATE.log.append({"cancelled": True, "ts": datetime.now(UTC).isoformat()})
        raise


def start(scenario: dict) -> None:
    if STATE.task and not STATE.task.done():
        raise RuntimeError(f"scenario '{STATE.scenario_name}' is already running")
    loop = asyncio.get_event_loop()
    STATE.task = loop.create_task(_run_scenario(scenario))


def stop() -> bool:
    if STATE.task and not STATE.task.done():
        STATE.task.cancel()
        return True
    return False


def status() -> dict:
    task = STATE.task
    running = bool(task and not task.done())
    return {
        "running": running,
        "scenario_name": STATE.scenario_name,
        "started_at": STATE.started_at.isoformat() if STATE.started_at else None,
        "steps_total": STATE.steps_total,
        "steps_completed": STATE.steps_completed,
        "last_error": STATE.last_error,
        "log": STATE.log[-30:],  # tail
    }


async def inject_one(kind: str, payload: dict) -> dict:
    """Fire a single scenario step out-of-band (for the control panel)."""
    handler = STEP_HANDLERS.get(kind)
    if not handler:
        raise ValueError(f"unknown kind {kind}")
    return await handler(payload)
