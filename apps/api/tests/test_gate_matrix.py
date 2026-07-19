"""Pure-function tests for the §2.4 action-gate matrix.

Runs without any database, LLM, or Redis — just verifies the decision table
and the safety-critical asymmetry rule that the PRD calls out as load-bearing.

    pytest apps/api/tests/test_gate_matrix.py
"""
from __future__ import annotations

import pytest

from app.gate.decide import Decision, matrix_decision


@pytest.mark.parametrize(
    "band,severity,expected",
    [
        ("RUMOR", "LOW", Decision.LOG),
        ("RUMOR", "MED", Decision.LOG),
        ("PROBABLE", "LOW", Decision.SOFT_NUDGE),
        ("PROBABLE", "MED", Decision.DISPATCH_STAFF),
        ("CONFIRMED", "LOW", Decision.SOFT_NUDGE),
        ("CONFIRMED", "MED", Decision.DISPATCH_STAFF),
    ],
)
def test_non_critical_matrix(band: str, severity: str, expected: Decision) -> None:
    r = matrix_decision(band=band, severity=severity, category="spill")
    assert r.decision is expected


@pytest.mark.parametrize("band", ["RUMOR", "PROBABLE", "CONFIRMED"])
@pytest.mark.parametrize("severity", ["HIGH", "CRITICAL"])
def test_safety_critical_asymmetry_by_severity(band: str, severity: str) -> None:
    """HIGH/CRITICAL severity ALWAYS routes to human authorization,
    even at RUMOR band — the surface-early rule from §2.4."""
    r = matrix_decision(band=band, severity=severity, category="spill")
    assert r.decision is Decision.REQUEST_HUMAN_AUTH


@pytest.mark.parametrize("category", ["medical", "security", "structural"])
def test_safety_critical_category_asymmetry(category: str) -> None:
    """Safety-critical categories route to human auth even at RUMOR+LOW,
    because the category itself is dangerous."""
    r = matrix_decision(band="RUMOR", severity="LOW", category=category)
    assert r.decision is Decision.REQUEST_HUMAN_AUTH


def test_medical_fan_nudge_allowed() -> None:
    r = matrix_decision(band="RUMOR", severity="HIGH", category="medical")
    assert r.proposed_action["fan_nudge_allowed"] is True


def test_security_no_fan_nudge() -> None:
    """Security incidents must NOT broadcast to fans — evacuation is a
    staff-authorized action, and mass fan nudges risk panic."""
    r = matrix_decision(band="PROBABLE", severity="HIGH", category="security")
    assert r.proposed_action["fan_nudge_allowed"] is False
