"""Action gate — the confidence × severity decision matrix (PRD §2.4).

This is the heart of the trust model: *what the system is allowed to do* depends
on both how sure it is (confidence band) and how bad it is (severity class).

Matrix
------

                | LOW              | MED                    | HIGH                       | CRITICAL
    ------------|------------------|------------------------|----------------------------|--------------------------------
    RUMOR       | LOG              | LOG + VOL_VERIFY       | REQUEST_HUMAN_AUTH (surface early — the asymmetry)
    PROBABLE    | SOFT_NUDGE       | DISPATCH_STAFF+VOL     | REQUEST_HUMAN_AUTH + pre-stage
    CONFIRMED   | SOFT_NUDGE       | DISPATCH + FAN_GUIDE   | REQUEST_HUMAN_AUTH (never auto-fire on safety-critical)

The **asymmetry** rule (§2.4 last paragraph): safety-critical categories bias
toward *surfacing early* even on weak signal. Missing a real emergency is worse
than false-alarming a human authorizer.

Idempotency
-----------
Each decision is keyed by (event_id, band, severity, event.status). We only
re-emit when one of those changes, so a Canonical Event that stays PROBABLE/MED
across many ticks doesn't spam the queues.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.catalog import is_safety_critical
from app.models import CanonicalEvent, PendingAuthorization, ResolutionLedger
from app.models.event import AuthStatus, EventStatus
from app.models.ledger import LedgerAction


class Decision(str, Enum):
    LOG = "LOG"                              # log only, no fan-out
    SOFT_NUDGE = "SOFT_NUDGE"                # push a fan nudge, low-priority staff queue
    DISPATCH_STAFF = "DISPATCH_STAFF"        # staff work-order + volunteer script + fan guidance
    REQUEST_HUMAN_AUTH = "REQUEST_HUMAN_AUTH"  # nothing consequential fires until a human approves


@dataclass(frozen=True)
class GateResult:
    decision: Decision
    reasoning: str
    proposed_action: dict
    next_status: str  # target CanonicalEvent.status after this decision


# ---------- pure matrix function -------------------------------------------


def matrix_decision(*, band: str, severity: str, category: str) -> GateResult:
    """Pure function — decision derived from (band, severity, category).

    Split into a pure step so it's directly unit-testable against §2.4 fixtures.
    """
    safety_critical_category = is_safety_critical(category)
    safety_critical_severity = severity in ("HIGH", "CRITICAL")
    safety_critical = safety_critical_category or safety_critical_severity

    # ---- The asymmetry ------------------------------------------------------
    # If it's safety-critical, we ALWAYS surface to a human — even at RUMOR
    # (a human quickly dismisses a false alarm; a missed real one is catastrophic).
    if safety_critical:
        return GateResult(
            decision=Decision.REQUEST_HUMAN_AUTH,
            reasoning=(
                f"safety-critical (category={category}, severity={severity}) — "
                f"surface to human authorizer regardless of confidence band ({band})"
            ),
            proposed_action={
                "kind": "safety_critical_response",
                "band": band,
                "severity": severity,
                "audiences": ["staff", "medical" if category == "medical" else "security"],
                "fan_nudge_allowed": category not in ("security", "structural"),
            },
            next_status=EventStatus.PENDING_AUTH.value,
        )

    # ---- Non-critical matrix ------------------------------------------------
    if band == "RUMOR":
        if severity == "LOW":
            return GateResult(
                decision=Decision.LOG,
                reasoning="rumor + low — log only, watch for corroboration",
                proposed_action={"kind": "log_only"},
                next_status=EventStatus.OPEN.value,
            )
        # RUMOR + MED — log but prompt a volunteer to verify
        return GateResult(
            decision=Decision.LOG,
            reasoning="rumor + medium — nudge nearest volunteer to verify",
            proposed_action={"kind": "volunteer_verify"},
            next_status=EventStatus.OPEN.value,
        )

    if band == "PROBABLE":
        if severity == "LOW":
            return GateResult(
                decision=Decision.SOFT_NUDGE,
                reasoning="probable + low — soft fan nudge, low-priority staff queue",
                proposed_action={"kind": "soft_nudge", "priority": "low"},
                next_status=EventStatus.OPEN.value,
            )
        return GateResult(
            decision=Decision.DISPATCH_STAFF,
            reasoning="probable + medium — dispatch staff + volunteer script",
            proposed_action={"kind": "dispatch", "priority": "medium"},
            next_status=EventStatus.DISPATCHED.value,
        )

    # CONFIRMED
    if severity == "LOW":
        return GateResult(
            decision=Decision.SOFT_NUDGE,
            reasoning="confirmed + low — auto fan/staff nudges",
            proposed_action={"kind": "soft_nudge", "priority": "low"},
            next_status=EventStatus.OPEN.value,
        )
    return GateResult(
        decision=Decision.DISPATCH_STAFF,
        reasoning="confirmed + medium — dispatch + fan guidance",
        proposed_action={"kind": "dispatch", "priority": "high"},
        next_status=EventStatus.DISPATCHED.value,
    )


# ---------- side-effect wrapper --------------------------------------------


async def decide_and_apply(session: AsyncSession, event: CanonicalEvent) -> None:
    """Compute the gate decision and apply it: update event.status, create
    a PendingAuthorization row when needed, and log to the ledger.

    Rendering (fan nudge / volunteer script / staff work-order) is a separate
    concern (Milestone 6). We just decide + persist + emit an internal event
    that rendering subscribes to.
    """
    prior_status = event.status
    result = matrix_decision(band=event.confidence_band, severity=event.severity,
                             category=event.category)

    # Idempotency — only act if the decision differs from what's on the row already.
    # Once an event is DISPATCHED or PENDING_AUTH, don't retreat it to OPEN.
    already_engaged = prior_status in (EventStatus.DISPATCHED.value, EventStatus.PENDING_AUTH.value,
                                       EventStatus.RESOLVED.value)
    if already_engaged and result.next_status == EventStatus.OPEN.value:
        result_next_status = prior_status  # keep engagement
    else:
        result_next_status = result.next_status

    event.status = result_next_status

    # For REQUEST_HUMAN_AUTH, materialize a queue row (idempotent by event_id + status)
    if result.decision == Decision.REQUEST_HUMAN_AUTH:
        existing = (
            await session.execute(
                select(PendingAuthorization).where(
                    PendingAuthorization.event_id == event.id,
                    PendingAuthorization.status == AuthStatus.PENDING.value,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                PendingAuthorization(
                    id=uuid.uuid4(),
                    event_id=event.id,
                    proposed_action=result.proposed_action,
                    evidence={
                        "band": event.confidence_band,
                        "score": event.confidence_score,
                        "severity": event.severity,
                        "severity_reason": event.severity_reason,
                        "source_mix": event.source_mix,
                        "distinct_observers": event.distinct_observers,
                        "canonical_summary": event.canonical_summary,
                    },
                    status=AuthStatus.PENDING.value,
                )
            )
            session.add(
                ResolutionLedger(
                    id=uuid.uuid4(),
                    event_id=event.id,
                    action=LedgerAction.AUTH_REQUESTED.value,
                    payload={"proposed_action": result.proposed_action,
                             "reasoning": result.reasoning},
                )
            )

    # Always log the gate decision
    session.add(
        ResolutionLedger(
            id=uuid.uuid4(),
            event_id=event.id,
            action=LedgerAction.GATE_DECISION.value,
            payload={
                "band": event.confidence_band,
                "severity": event.severity,
                "category": event.category,
                "decision": result.decision.value,
                "prior_status": prior_status,
                "next_status": result_next_status,
                "reasoning": result.reasoning,
                "proposed_action": result.proposed_action,
            },
        )
    )

    # Fire the render + realtime hand-off (Milestone 6).
    # Imported lazily so the gate can be exercised in isolation for tests.
    try:
        from app.rendering.dispatch import dispatch_render
    except ImportError:
        return
    await dispatch_render(session, event, result)
