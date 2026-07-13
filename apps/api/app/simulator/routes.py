"""Simulator HTTP API.

- GET  /simulator/scenarios       — list available scenarios
- POST /simulator/run             — start a scenario by name
- POST /simulator/stop            — cancel the running scenario
- GET  /simulator/status          — running state + tail of the step log
- POST /simulator/inject          — fire one arbitrary step (for control-panel one-offs)

Guarded by ``require_role("organizer", "staff")`` — regular users can't drive
the simulator.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.jwt import require_role
from app.models import User
from app.simulator import runner
from app.simulator.scenarios import list_scenarios, load_scenario

router = APIRouter(prefix="/simulator", tags=["simulator"])


class RunBody(BaseModel):
    name: str


class InjectBody(BaseModel):
    kind: str = Field(..., description=", ".join(sorted(runner.STEP_HANDLERS)))
    payload: dict


@router.get("/scenarios")
async def list_(
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
) -> list[dict]:
    return [
        {
            "name": s["name"],
            "description": s.get("description"),
            "steps": len(s["steps"]),
        }
        for s in list_scenarios()
    ]


@router.post("/run")
async def run(
    body: RunBody,
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
) -> dict:
    scenario = load_scenario(body.name)
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"scenario {body.name} not found")
    try:
        runner.start(scenario)
    except RuntimeError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    return {"started": body.name, "steps": len(scenario["steps"])}


@router.post("/stop")
async def stop(
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
) -> dict:
    return {"stopped": runner.stop()}


@router.get("/status")
async def status_(
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
) -> dict:
    return runner.status()


@router.post("/inject")
async def inject(
    body: InjectBody,
    _: Annotated[User, Depends(require_role("organizer", "staff"))],
) -> dict:
    if body.kind not in runner.STEP_HANDLERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown kind {body.kind}")
    try:
        result = await runner.inject_one(body.kind, body.payload)
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    return {"kind": body.kind, "result": result}
