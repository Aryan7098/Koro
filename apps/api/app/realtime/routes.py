"""SSE (Server-Sent Events) endpoints.

Frontend connects to::

    GET /realtime/fan?device_fp=<fp>&user_id=<optional>
    GET /realtime/volunteer?user_id=<id>
    GET /realtime/staff?user_id=<id>
    GET /realtime/organizer

Events emitted (event_type field):
    - fan.nudge       {event_id, category, headline, body, action_hint, lang, ...}
    - fan.resolved    {event_id, headline, body}
    - volunteer.script{event_id, category, script}
    - staff.workorder {event_id, category, severity, action, evidence_ref}
    - staff.auth_request {event_id, severity, evidence}
    - organizer.event {event_id, snapshot}
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Query, Request, status
from sse_starlette.sse import EventSourceResponse

from app.realtime import bus

router = APIRouter(prefix="/realtime", tags=["realtime"])


async def _stream(role: str, key: str, request: Request) -> AsyncGenerator[dict, None]:
    q = bus.subscribe(role, key)
    try:
        # Hello ping so the client knows the connection is live
        yield {"event": "hello", "data": json.dumps({"role": role, "key": key})}
        while True:
            if await request.is_disconnected():
                break
            try:
                msg = await asyncio.wait_for(q.get(), timeout=15.0)
            except asyncio.TimeoutError:
                # keepalive comment
                yield {"event": "ping", "data": "{}"}
                continue
            yield {"event": "message", "data": msg}
    finally:
        bus.unsubscribe(role, key, q)


@router.get("/fan")
async def fan_stream(
    request: Request,
    device_fp: str | None = Query(None),
    user_id: str | None = Query(None),
) -> EventSourceResponse:
    key = user_id or device_fp
    if not key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "device_fp or user_id required")
    return EventSourceResponse(_stream("fan", key, request))


@router.get("/volunteer")
async def volunteer_stream(
    request: Request, user_id: str = Query(...)
) -> EventSourceResponse:
    return EventSourceResponse(_stream("volunteer", user_id, request))


@router.get("/staff")
async def staff_stream(
    request: Request, user_id: str = Query(...)
) -> EventSourceResponse:
    return EventSourceResponse(_stream("staff", user_id, request))


@router.get("/organizer")
async def organizer_stream(request: Request) -> EventSourceResponse:
    return EventSourceResponse(_stream("organizer", "all", request))
