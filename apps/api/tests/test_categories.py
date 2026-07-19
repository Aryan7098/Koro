"""Tests for the shared category catalog.

The catalog is loaded from packages/schemas/categories.json and consumed by
both backend (severity bias, safety-critical flag → action gate) and
frontend (labels in 6 languages). These tests lock the guarantees the rest
of the codebase relies on:

- Every category exposed to the fan surface has labels in all 6 supported
  languages (fan sees a label in their own language even if the LLM never
  reaches them).
- Safety-critical flags match the PRD categories exactly (medical,
  security, structural) — the action gate keys off this list.
- default_severity() returns a valid enum member for every category.
"""
from __future__ import annotations

import pytest

from app.core.catalog import (
    category,
    default_severity,
    is_safety_critical,
    label,
    load_categories,
)


REQUIRED_LANGS = {"en", "es", "fr", "ar", "pt", "ko"}
VALID_SEVERITIES = {"LOW", "MED", "HIGH", "CRITICAL"}
EXPECTED_SAFETY_CRITICAL = {"medical", "security", "structural"}


def test_catalog_loads_non_empty() -> None:
    cats = load_categories()
    assert len(cats) >= 8, "PRD expects at least the eight named fan categories"


def test_every_category_has_all_supported_languages() -> None:
    """Fan surface renders labels in the fan's language — a missing key would
    show 'undefined' in the UI."""
    for cid, cat in load_categories().items():
        labels = cat.get("label", {})
        missing = REQUIRED_LANGS - set(labels.keys())
        assert not missing, f"category {cid!r} missing labels for {missing}"


def test_every_category_severity_bias_is_valid() -> None:
    for cid, cat in load_categories().items():
        assert cat.get("severity_bias") in VALID_SEVERITIES, (
            f"category {cid!r} has invalid severity_bias"
        )


def test_safety_critical_set_matches_prd() -> None:
    """PRD §2.4 asymmetry is keyed on exactly these three categories —
    if this set drifts, the gate's safety-critical behavior silently changes."""
    actual = {cid for cid, cat in load_categories().items() if cat.get("safety_critical")}
    assert actual == EXPECTED_SAFETY_CRITICAL


@pytest.mark.parametrize("cid", ["medical", "security", "structural"])
def test_is_safety_critical_true_for_safety_categories(cid: str) -> None:
    assert is_safety_critical(cid) is True


@pytest.mark.parametrize("cid", ["spill", "vendor", "wayfinding", "smell"])
def test_is_safety_critical_false_for_ordinary_categories(cid: str) -> None:
    assert is_safety_critical(cid) is False


def test_is_safety_critical_false_for_unknown_category() -> None:
    """Unknown categories should not accidentally trigger the safety-critical
    asymmetry — better to log-only an unrecognized event than escalate."""
    assert is_safety_critical("not_a_real_category") is False


def test_label_falls_back_to_english() -> None:
    """If a fan somehow selects an unsupported language, we still show
    something readable rather than the raw id."""
    en_label = label("spill", "en")
    assert label("spill", "xx") == en_label


def test_label_returns_id_for_unknown_category() -> None:
    """Last-resort fallback so UIs never crash on a rename."""
    assert label("not_a_real_category", "en") == "not_a_real_category"


def test_default_severity_returns_low_for_unknown() -> None:
    assert default_severity("not_a_real_category") == "LOW"


def test_category_returns_none_for_unknown() -> None:
    assert category("not_a_real_category") is None
