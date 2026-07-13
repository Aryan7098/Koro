"""In-process pub/sub bus for realtime events.

For the hackathon we don't need Redis pubsub — the API and worker run in the
same process, so an in-memory asyncio.Queue per connected subscriber is enough.

Channels are addressed by (role, key). Publish once, every subscriber to that
(role, key) gets a copy. The Queue.put_nowait pattern with size 100 means a
slow client is dropped rather than backpressuring the fusion loop.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

_subscribers: dict[tuple[str, str], set[asyncio.Queue]] = defaultdict(set)


def subscribe(role: str, key: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers[(role, key)].add(q)
    return q


def unsubscribe(role: str, key: str, q: asyncio.Queue) -> None:
    subs = _subscribers.get((role, key))
    if not subs:
        return
    subs.discard(q)
    if not subs:
        _subscribers.pop((role, key), None)


def publish(role: str, key: str, event_type: str, payload: dict[str, Any]) -> None:
    subs = _subscribers.get((role, key))
    if not subs:
        return
    msg = {"type": event_type, "data": payload}
    encoded = json.dumps(msg, ensure_ascii=False, default=str)
    for q in list(subs):
        try:
            q.put_nowait(encoded)
        except asyncio.QueueFull:
            # slow subscriber — drop the message rather than block the publisher
            pass


def publish_role_broadcast(role: str, event_type: str, payload: dict[str, Any]) -> None:
    """Publish to every subscriber of ``role`` regardless of key."""
    for (r, key), subs in list(_subscribers.items()):
        if r != role:
            continue
        publish(r, key, event_type, payload)


def subscriber_count(role: str, key: str | None = None) -> int:
    if key is None:
        return sum(len(v) for k, v in _subscribers.items() if k[0] == role)
    return len(_subscribers.get((role, key), set()))
