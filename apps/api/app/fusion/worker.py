"""Fusion tick — the 3-second heartbeat that turns raw reports into Canonical Events.

Sequence per tick:
    1. Drain passive signals from Redis; mark node-level agreement flags in Redis.
    2. Drain pending report ids from Redis; load rows.
    3. Batch-normalize via Claude Haiku (or offline fallback).
    4. Embed canonical_en with bge-m3.
    5. For each report:
       - If it's a volunteer confirm/deny → link directly to its target event.
       - Otherwise → geo-resolve → cluster (find_or_create) → link.
    6. For each affected event: gather contributions, compute confidence,
       infer severity, upsert, ledger-log, hand to the action gate.
    7. Any raw exception during a report's processing marks it REJECTED with
       the reason — never crashes the whole tick.

The tick is idempotent-ish: reports already in status != PENDING are skipped
if they somehow re-enter the queue.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.redis import get_redis
from app.fusion import cluster, geo_resolve, normalize, severity, trust
from app.fusion.venue_graph import load_graph
from app.ingress.queue import drain_passive, drain_reports
from app.llm.embeddings import embed
from app.models import (
    CanonicalEvent,
    EventReport,
    Report,
    ResolutionLedger,
    User,
)
from app.models.event import EventStatus
from app.models.ledger import LedgerAction
from app.models.report import ReportStatus

log = logging.getLogger(__name__)


PASSIVE_AGREEMENT_TTL = 60  # a passive signal counts as "recent agreement" for 60s


# ---------- passive signals -------------------------------------------------


async def process_passive_batch(signals: list[dict]) -> None:
    """Store node-level agreement flags in Redis for the confidence step to consume.

    Rules (kept simple; the plan says passive is a corroborator, not a driver):
        - density > 3.0 people/m² at node N → agreement for events at N.
        - throughput reading below the *expected floor* for a gate → agreement
          for a 'gate' event at that node. Above floor → *dis*agreement
          (used later by plausibility checks).
        - queue_timer > 600s → agreement for a 'gate' or 'crowd' event at that node.
        - weather / transit are informational for now.
    """
    r = get_redis()
    for sig in signals:
        kind = sig.get("kind")
        node_id = sig.get("node_id")
        val = float(sig.get("value", 0.0) or 0.0)
        if not node_id:
            continue

        agrees = False
        disagrees = False
        if kind == "density" and val >= 3.0:
            agrees = True
        elif kind == "queue_timer" and val >= 600:
            agrees = True
        elif kind == "throughput":
            # a busy gate contradicts a "gate closed" claim (plausibility drop)
            if val >= 200:
                disagrees = True
            elif val < 20:
                agrees = True

        if agrees:
            await r.setex(f"echostand:passive_agree:{node_id}", PASSIVE_AGREEMENT_TTL, "1")
        if disagrees:
            await r.setex(f"echostand:passive_disagree:{node_id}", PASSIVE_AGREEMENT_TTL, "1")


async def passive_agrees(node_id: str) -> bool:
    r = get_redis()
    return await r.exists(f"echostand:passive_agree:{node_id}") == 1


async def passive_disagrees(node_id: str) -> bool:
    r = get_redis()
    return await r.exists(f"echostand:passive_disagree:{node_id}") == 1


# ---------- helpers ---------------------------------------------------------


def _neighborhood_candidates(graph, node_hint: str | None, hops: int = 2) -> list[dict]:
    if not node_hint or node_hint not in graph.nodes:
        # No hint — expose the top-level candidates (gates, plazas, concourses)
        return [
            {"id": n.id, "name": n.name, "type": n.type, "level": n.level}
            for n in list(graph.nodes.values())[:15]
        ]
    ids = graph.neighborhood(node_hint, hops=hops)
    return [
        {
            "id": graph.nodes[i].id,
            "name": graph.nodes[i].name,
            "type": graph.nodes[i].type,
            "level": graph.nodes[i].level,
        }
        for i in ids
        if i in graph.nodes
    ]


async def _link_report_to_event(
    session: AsyncSession, report: Report, event: CanonicalEvent
) -> None:
    # Idempotent
    existing = (
        await session.execute(
            select(EventReport).where(
                EventReport.event_id == event.id, EventReport.report_id == report.id
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        session.add(EventReport(event_id=event.id, report_id=report.id))


# ---------- main tick -------------------------------------------------------


async def _process_tick() -> dict[str, Any]:
    stats = {"reports_processed": 0, "events_touched": 0, "passive_signals": 0, "errors": 0}

    # 1. Passive first — so confidence math can see any fresh agreement.
    signals = await drain_passive()
    if signals:
        stats["passive_signals"] = len(signals)
        await process_passive_batch(signals)

    # 2. Reports
    report_ids_raw = await drain_reports()
    if not report_ids_raw:
        return stats

    report_uuids = [uuid.UUID(x) for x in report_ids_raw]

    async with SessionLocal() as session:
        graph = await load_graph(session)

        # Load pending reports (users looked up separately during rescore)
        reports = (
            await session.execute(select(Report).where(Report.id.in_(report_uuids)))
        ).scalars().all()
        pending = [r for r in reports if r.status == ReportStatus.PENDING.value]

        # 3. Normalize (Haiku batch)
        norm_inputs = [
            {
                "id": str(r.id),
                "text": r.raw_text or "",
                "language": r.raw_language,
                "category_hint": r.category_hint,
                "node_hint": r.node_hint,
                "confirm_value": r.confirm_value,
            }
            for r in pending
        ]
        normalized = await normalize.normalize_batch(norm_inputs)
        if normalized is None:
            normalized = [normalize.offline_normalize(x) for x in norm_inputs]
        norm_by_id = {n["id"]: n for n in normalized}

        # 4. Embed canonical_en for clustering
        texts = [norm_by_id[str(r.id)].get("canonical_en", "") for r in pending]
        vectors = embed(texts) if texts else []
        vec_by_id = {str(r.id): v for r, v in zip(pending, vectors)}

        touched_event_ids: set[uuid.UUID] = set()

        # 5. Cluster / link each report
        for r in pending:
            try:
                nr = norm_by_id[str(r.id)]
                r.normalized = nr
                r.embedding = vec_by_id.get(str(r.id))
                r.status = ReportStatus.NORMALIZED.value

                # Volunteer confirm/deny — route directly, skip clustering
                if r.confirms_event_id:
                    target = (
                        await session.execute(
                            select(CanonicalEvent).where(
                                CanonicalEvent.id == r.confirms_event_id
                            )
                        )
                    ).scalar_one_or_none()
                    if target is not None:
                        await _link_report_to_event(session, r, target)
                        target.last_seen = datetime.now(UTC)
                        r.status = ReportStatus.CLUSTERED.value
                        touched_event_ids.add(target.id)
                    continue

                # Geo-resolve → cluster
                node_id = nr.get("location_phrase") or r.node_hint
                # Prefer LLM resolution when text is present
                if r.raw_text and settings.anthropic_api_key:
                    candidates = _neighborhood_candidates(graph, r.node_hint)
                    resolved = await geo_resolve.resolve(
                        nr.get("canonical_en", ""),
                        r.node_hint,
                        r.seat_hint,
                        candidates,
                    )
                    if resolved and resolved.get("node_id") not in (None, "UNCERTAIN"):
                        node_id = resolved["node_id"]

                if not node_id or node_id not in graph.nodes:
                    r.status = ReportStatus.REJECTED.value
                    session.add(
                        ResolutionLedger(
                            action=LedgerAction.REPORT_INGESTED.value,
                            report_ids=[str(r.id)],
                            payload={"rejected_reason": "no valid node_id"},
                        )
                    )
                    continue

                event, is_new = await cluster.find_or_create_cluster(
                    session,
                    node_id=node_id,
                    category=nr.get("category", "UNCERTAIN"),
                    report_embedding=vec_by_id.get(str(r.id), []),
                    canonical_en=nr.get("canonical_en", ""),
                )
                if event is None:
                    r.status = ReportStatus.REJECTED.value
                    continue

                await _link_report_to_event(session, r, event)
                event.last_seen = datetime.now(UTC)
                r.status = ReportStatus.CLUSTERED.value
                touched_event_ids.add(event.id)
                if is_new:
                    session.add(
                        ResolutionLedger(
                            event_id=event.id,
                            action=LedgerAction.EVENT_CREATED.value,
                            report_ids=[str(r.id)],
                            payload={
                                "node_id": node_id,
                                "category": event.category,
                                "canonical_summary": event.canonical_summary,
                            },
                        )
                    )
            except Exception as e:
                stats["errors"] += 1
                log.exception("report %s processing failed: %s", r.id, e)
                r.status = ReportStatus.REJECTED.value

            stats["reports_processed"] += 1

        await session.flush()

        # 6. Rescore + severity for each touched event
        for event_id in touched_event_ids:
            try:
                await _rescore_event(session, event_id)
                stats["events_touched"] += 1
            except Exception as e:
                stats["errors"] += 1
                log.exception("rescore for %s failed: %s", event_id, e)

        await session.commit()

    return stats


async def _rescore_event(session: AsyncSession, event_id: uuid.UUID) -> None:
    event = (
        await session.execute(select(CanonicalEvent).where(CanonicalEvent.id == event_id))
    ).scalar_one_or_none()
    if event is None:
        return

    # Gather all linked reports + their contributors
    link_rows = (
        await session.execute(
            select(EventReport.report_id).where(EventReport.event_id == event_id)
        )
    ).scalars().all()
    if not link_rows:
        return

    reports = (
        await session.execute(select(Report).where(Report.id.in_(link_rows)))
    ).scalars().all()

    # Load users we need tiers for
    user_ids = {r.source_user_id for r in reports if r.source_user_id}
    users_by_id: dict[uuid.UUID, User] = {}
    if user_ids:
        for u in (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars():
            users_by_id[u.id] = u

    contribs: list[trust.ReportContribution] = []
    tier_counts = {"T0": 0, "T1": 0, "T2": 0, "T3": 0}
    photos = 0
    for r in reports:
        photos += len(r.media_ids or [])
        if r.source_user_id and r.source_user_id in users_by_id:
            u = users_by_id[r.source_user_id]
            tier = u.tier
            reputation = u.reputation_score
        else:
            tier = "T0"
            reputation = 1.0
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

        contribs.append(
            trust.ReportContribution(
                tier=tier,
                device_fp=r.device_fp,
                user_id=str(r.source_user_id) if r.source_user_id else None,
                is_confirmation=(r.confirm_value == "confirm"),
                is_denial=(r.confirm_value == "deny"),
                reputation=reputation,
            )
        )

    # Plausibility & passive agreement
    plausible = True
    if event.category == "gate" and await passive_disagrees(event.node_id):
        plausible = False
    agreement = await passive_agrees(event.node_id)

    conf = trust.compute_confidence(contribs, plausible=plausible, passive_agreement=agreement)

    # Snapshot for severity input
    snippets = []
    for r in reports[:20]:
        if r.normalized:
            snippets.append(r.normalized.get("canonical_en") or (r.raw_text or ""))
        else:
            snippets.append(r.raw_text or "")

    sev = await severity.infer_severity(
        event_id=str(event.id),
        category=event.category,
        canonical_summary=event.canonical_summary or "",
        report_ids=[str(r.id) for r in reports],
        report_snippets=snippets,
    )

    event.confidence_band = conf.band
    event.confidence_score = conf.score
    event.severity = sev["severity"]
    event.severity_reason = sev["reasoning"]
    event.distinct_observers = conf.distinct_observers
    event.source_mix = {
        **tier_counts,
        "passive_agree": agreement,
        "passive_disagree": (not plausible),
        "photos": photos,
    }

    session.add(
        ResolutionLedger(
            event_id=event.id,
            action=LedgerAction.EVENT_UPDATED.value,
            report_ids=[str(r.id) for r in reports],
            payload={
                "band": conf.band,
                "score": conf.score,
                "severity": sev["severity"],
                "source_mix": event.source_mix,
                "trust_reasoning": conf.reasoning,
                "severity_reasoning": sev["reasoning"],
            },
        )
    )

    # Hand off to action gate (Milestone 5 — imports lazily to avoid cycles)
    from app.gate.decide import decide_and_apply

    await decide_and_apply(session, event)


# ---------- runner ---------------------------------------------------------


_worker_task: asyncio.Task | None = None


async def _loop() -> None:
    log.info("fusion worker starting; tick=%.1fs", settings.fusion_tick_seconds)
    while True:
        try:
            stats = await _process_tick()
            if stats["reports_processed"] or stats["events_touched"]:
                log.info("fusion tick %s", stats)
        except Exception as e:  # pragma: no cover
            log.exception("fusion tick failed: %s", e)
        await asyncio.sleep(settings.fusion_tick_seconds)


def start_worker() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        return
    _worker_task = asyncio.get_event_loop().create_task(_loop())


async def stop_worker() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    _worker_task = None
