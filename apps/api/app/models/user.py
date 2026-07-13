from __future__ import annotations

import uuid
from enum import Enum

from sqlalchemy import JSON, Float, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Role(str, Enum):
    FAN = "fan"
    VOLUNTEER = "volunteer"
    STAFF = "staff"
    ORGANIZER = "organizer"


class Tier(str, Enum):
    T0 = "T0"  # Anonymous / new device
    T1 = "T1"  # Known fan
    T2 = "T2"  # Role-verified volunteer
    T3 = "T3"  # Verified staff / control room


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    tier: Mapped[str] = mapped_column(String(4), nullable=False, default=Tier.T0.value)
    reputation_score: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    language: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    accessibility_profile: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict
    )  # {"mobility": bool, "sensory": bool}
    home_node_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(32), nullable=True)  # for volunteers/staff
    category_ownership: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list
    )  # e.g. ["medical", "security"] for staff
