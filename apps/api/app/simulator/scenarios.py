"""Scenario file loader + validator.

Scenarios live under ``data/scenarios/*.json``. Each is an ordered list of steps:

    {
      "name": "demo_full_narrative",
      "description": "§3.10 beats 1–6",
      "steps": [
        {"delay_ms": 0,    "kind": "fan_report",       "payload": {...}},
        {"delay_ms": 2000, "kind": "passive_signal",   "payload": {...}},
        {"delay_ms": 4000, "kind": "volunteer_confirm","payload": {"event_hint": "spill@112", ...}},
        ...
      ]
    }

``event_hint`` is a soft link so a volunteer_confirm step can find the event
without hard-coding a UUID that doesn't exist yet at authoring time — the runner
resolves it against the most recent open event that matches ``category`` + ``node_id``.
"""
from __future__ import annotations

import json
from functools import lru_cache

from app.core.paths import repo_root

SCENARIOS_DIR = repo_root() / "data" / "scenarios"


ALLOWED_KINDS = {
    "fan_report",
    "volunteer_report",
    "volunteer_confirm",
    "volunteer_deny",
    "staff_report",
    "staff_state_set",
    "passive_signal",
}


def _validate(scenario: dict) -> None:
    if "name" not in scenario or "steps" not in scenario:
        raise ValueError("scenario missing name/steps")
    for i, step in enumerate(scenario["steps"]):
        if "kind" not in step or "payload" not in step:
            raise ValueError(f"step {i} missing kind/payload")
        if step["kind"] not in ALLOWED_KINDS:
            raise ValueError(f"step {i} kind {step['kind']} not in {ALLOWED_KINDS}")
        if "delay_ms" not in step:
            step["delay_ms"] = 0


@lru_cache
def list_scenarios() -> list[dict]:
    out = []
    if not SCENARIOS_DIR.exists():
        return out
    for path in sorted(SCENARIOS_DIR.glob("*.json")):
        scenario = json.loads(path.read_text(encoding="utf-8"))
        _validate(scenario)
        scenario["_path"] = str(path)
        out.append(scenario)
    return out


def load_scenario(name: str) -> dict | None:
    for s in list_scenarios():
        if s["name"] == name:
            return s
    return None
