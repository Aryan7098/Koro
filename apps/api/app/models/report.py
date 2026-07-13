from __future__ import annotations

import uuid
from enum import Enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReportSource(str, Enum):
    FAN = "fan"
    VOLUNTEER = "volunteer"
    STAFF = "staff"
    PASSIVE = "passive"


class ReportStatus(str, Enum):
    PENDING = "pending"       # awaiting fusion tick
    NORMALIZED = "normalized" # processed but not yet clustered
    CLUSTERED = "clustered"   # linked to a canonical event
    REJECTED = "rejected"     # implausible / suppressed


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    source_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    device_fp: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    category_hint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    node_hint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    seat_hint: Mapped[str | None] = mapped_column(String(32), nullable=True)
    media_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    device_context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Fusion outputs
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ReportStatus.PENDING.value, index=True
    )
    normalized: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # normalized shape: {category, severity_hint, location_phrase, canonical_en, uncertain: bool}
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024), nullable=True)

    # Confirm/deny link (volunteer confirming an existing event)
    confirms_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_events.id"), nullable=True
    )
    confirm_value: Mapped[str | None] = mapped_column(
        String(8), nullable=True
    )  # "confirm" | "deny"

    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
