"""Pending-report queue in Redis.

The fusion worker's tick pops all reports currently on this queue and processes them.
We use a Redis list (LPUSH from ingress, RPOP by the worker) — good enough at hackathon
throughput and preserves rough insertion order.
"""
from __future__ import annotations

import json
from uuid import UUID

from app.core.redis import get_redis

PENDING_KEY = "echostand:pending_reports"
PASSIVE_KEY = "echostand:pending_signals"


async def enqueue_report(report_id: UUID) -> None:
    await get_redis().lpush(PENDING_KEY, str(report_id))


async def enqueue_passive(payload: dict) -> None:
    await get_redis().lpush(PASSIVE_KEY, json.dumps(payload))


async def drain_reports(max_items: int = 200) -> list[str]:
    r = get_redis()
    out: list[str] = []
    for _ in range(max_items):
        item = await r.rpop(PENDING_KEY)
        if item is None:
            break
        out.append(item)
    return out


async def drain_passive(max_items: int = 200) -> list[dict]:
    r = get_redis()
    out: list[dict] = []
    for _ in range(max_items):
        item = await r.rpop(PASSIVE_KEY)
        if item is None:
            break
        out.append(json.loads(item))
    return out
