"""Passive signal ingress.

Passive signals are the non-human feeds from §1.2:
    - density  (people/m² at a node)
    - throughput (per-minute gate scans)
    - weather (rain/heat/wind level)
    - transit (delay minutes on a shuttle)
    - queue_timer (seconds of measured wait)

They are not "reports" but they *corroborate* human reports. The fusion tick
reads them from Redis and uses them as the ``passive_boost`` multiplier in
the confidence formula (§2.3) and as the plausibility check (an event that
disagrees with the sensors is auto-suppressed).
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.ingress.queue import enqueue_passive
from app.models import VenueNode

router = APIRouter(prefix="/signals", tags=["ingress:signals"])


class PassiveSignal(BaseModel):
    kind: str = Field(..., description="density | throughput | weather | transit | queue_timer")
    node_id: str | None = Field(None, description="venue_node.id if the signal is location-scoped")
    value: float = Field(..., description="Interpretation depends on kind")
    metadata: dict = Field(default_factory=dict)


@router.post("/passive")
async def ingest_passive(
    signal: PassiveSignal,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    if signal.kind not in {"density", "throughput", "weather", "transit", "queue_timer"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown kind: {signal.kind}")

    if signal.node_id:
        node = (
            await session.execute(select(VenueNode).where(VenueNode.id == signal.node_id))
        ).scalar_one_or_none()
        if node is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown node: {signal.node_id}")

    payload = {
        "kind": signal.kind,
        "node_id": signal.node_id,
        "value": signal.value,
        "metadata": signal.metadata,
        "ts": datetime.now(UTC).isoformat(),
    }
    await enqueue_passive(payload)
    return {"status": "queued", "signal": payload}
