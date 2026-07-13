from __future__ import annotations

import uuid
from enum import Enum

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LedgerAction(str, Enum):
    # Fusion / gate
    REPORT_INGESTED = "report_ingested"
    EVENT_CREATED = "event_created"
    EVENT_UPDATED = "event_updated"
    GATE_DECISION = "gate_decision"
    # Authorization
    AUTH_REQUESTED = "auth_requested"
    AUTH_APPROVED = "auth_approved"
    AUTH_DENIED = "auth_denied"
    # Ops
    DISPATCHED = "dispatched"
    STATE_SET = "state_set"
    RESOLVED = "resolved"
    NOTIFIED = "notified"
    RENDERED = "rendered"


class ResolutionLedger(Base):
    """Append-only history: report → event → action → resolution.

    Powers loop-closure and organizer pattern-mining. Also the traceability spine —
    ``GET /events/{id}/lineage`` reads from here.
    """

    __tablename__ = "resolution_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_events.id"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    report_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
