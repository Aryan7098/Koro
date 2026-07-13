from __future__ import annotations

import uuid
from enum import Enum

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConfidenceBand(str, Enum):
    RUMOR = "RUMOR"
    PROBABLE = "PROBABLE"
    CONFIRMED = "CONFIRMED"


class Severity(str, Enum):
    LOW = "LOW"
    MED = "MED"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class EventStatus(str, Enum):
    OPEN = "open"
    PENDING_AUTH = "pending_auth"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class CanonicalEvent(Base):
    __tablename__ = "canonical_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    node_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("venue_nodes.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(
        String(16), nullable=False, default=Severity.LOW.value, index=True
    )
    severity_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence_band: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ConfidenceBand.RUMOR.value, index=True
    )
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=EventStatus.OPEN.value, index=True
    )
    canonical_summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # short EN summary

    first_seen: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    resolved_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)

    # source_mix: {"T0": n, "T1": n, "T2": n, "T3": n, "passive_agree": bool, "photos": n}
    source_mix: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # distinct_observers: independence count (accounts + device_fps)
    distinct_observers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class EventReport(Base):
    """Many-to-many linkage between canonical events and the reports that fed them."""

    __tablename__ = "event_reports"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_events.id"), primary_key=True
    )
    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reports.id"), primary_key=True
    )


class AuthStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


class PendingAuthorization(Base):
    __tablename__ = "pending_authorizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_events.id"), nullable=False, index=True
    )
    proposed_action: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    evidence: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AuthStatus.PENDING.value, index=True
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    decided_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True), nullable=True)
