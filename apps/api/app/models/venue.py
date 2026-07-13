from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class VenueNode(Base):
    __tablename__ = "venue_nodes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    # gate | concourse | restroom | section | vendor | exit | medical | transit | landmark
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=100)  # e.g. 100/200/300
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    step_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    low_stimulus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    node_metadata: Mapped[dict] = mapped_column("metadata", JSON, nullable=False, default=dict)


class VenueEdge(Base):
    __tablename__ = "venue_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("venue_nodes.id"), nullable=False, index=True
    )
    to_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("venue_nodes.id"), nullable=False, index=True
    )
    distance_m: Mapped[float] = mapped_column(Float, nullable=False)
    step_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    width_m: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    low_stimulus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
