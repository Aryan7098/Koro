"""Per-device / per-user rate limiting.

Simple fixed-window counter in Redis: N reports per 60s per key.
Rejecting a burst with 429 is one of the levers named in Trust Model §2.5
("Rate + novelty limits per device blunt flooding").
"""
from __future__ import annotations

from fastapi import HTTPException, status

from app.core.redis import get_redis

DEFAULT_LIMIT = 20  # 20 reports / minute / device is generous for a human, brutal for a bot
WINDOW_SECONDS = 60


async def check_and_bump(key: str, limit: int = DEFAULT_LIMIT) -> None:
    r = get_redis()
    redis_key = f"echostand:rate:{key}"
    n = await r.incr(redis_key)
    if n == 1:
        await r.expire(redis_key, WINDOW_SECONDS)
    if n > limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"rate limit: {limit} reports per {WINDOW_SECONDS}s exceeded",
        )
