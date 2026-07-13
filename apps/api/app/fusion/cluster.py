"""Cross-lingual clustering.

Given a normalized+embedded report, decide: does it match an existing open
Canonical Event, or does it seed a new one?

Match criteria (all three must hold):
    1. Category matches (same category, or one is UNCERTAIN).
    2. Node is within ``NEIGHBORHOOD_HOPS`` of an existing event's node.
    3. Cosine similarity ≥ ``SIM_THRESHOLD`` between the report's embedding and
       the event's ``canonical_summary`` embedding.

If multiple events match, pick the highest-scoring one.
"""
from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.fusion.venue_graph import load_graph
from app.llm.embeddings import embed_one
from app.models import CanonicalEvent
from app.models.event import EventStatus

SIM_THRESHOLD = 0.72
NEIGHBORHOOD_HOPS = 2
STALE_MINUTES = 30  # events older than this without refresh don't accept new members


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    # bge-m3 normalizes at encode time — dot ≈ cosine — but be defensive
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


async def find_or_create_cluster(
    session: AsyncSession,
    *,
    node_id: str,
    category: str,
    report_embedding: list[float],
    canonical_en: str,
) -> tuple[CanonicalEvent | None, bool]:
    """Return (event, is_new). Returns (None, False) if we couldn't place it."""
    graph = await load_graph(session)
    neighborhood = set(graph.neighborhood(node_id, hops=NEIGHBORHOOD_HOPS))
    if not neighborhood:
        neighborhood = {node_id}

    # Pull candidate open events in the neighborhood
    stmt = select(CanonicalEvent).where(
        CanonicalEvent.status.in_(
            [
                EventStatus.OPEN.value,
                EventStatus.PENDING_AUTH.value,
                EventStatus.DISPATCHED.value,
            ]
        ),
        CanonicalEvent.node_id.in_(list(neighborhood)),
    )
    candidates = (await session.execute(stmt)).scalars().all()

    best: tuple[float, CanonicalEvent] | None = None
    for ev in candidates:
        if category != "UNCERTAIN" and ev.category != "UNCERTAIN" and ev.category != category:
            continue
        if not ev.canonical_summary:
            continue
        ev_vec = embed_one(ev.canonical_summary)
        sim = cosine(report_embedding, ev_vec)
        if sim < SIM_THRESHOLD:
            continue
        if best is None or sim > best[0]:
            best = (sim, ev)

    if best is not None:
        return best[1], False

    # Seed a new event
    new_ev = CanonicalEvent(
        node_id=node_id,
        category=category if category != "UNCERTAIN" else "wayfinding",
        canonical_summary=canonical_en[:500],
        status=EventStatus.OPEN.value,
        source_mix={"T0": 0, "T1": 0, "T2": 0, "T3": 0, "passive_agree": False, "photos": 0},
    )
    session.add(new_ev)
    await session.flush()  # populates new_ev.id
    return new_ev, True
