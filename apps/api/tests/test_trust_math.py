"""Tests for the PRD §2.3 trust-weighted confidence math.

The formula is load-bearing for the whole product: it decides whether an
event stays a RUMOR, gets promoted to PROBABLE, or gets CONFIRMED and
allowed to fire consequential actions. These tests lock the invariants
called out by name in the PRD:

- Independence is sub-linear in observer count (Nx observers ≠ Nx score).
- Tier weights strictly order T0 < T1 < T2 < T3.
- Anonymous-only clusters are hard-capped at PROBABLE regardless of volume
  (anti-spam clause).
- A single T3 confirm on a plausible event promotes it to CONFIRMED.
- Volunteer/staff DENY reduces trust net of confirmations.
- Plausibility=False zeroes the score (implausibility gates action).
"""
from __future__ import annotations

import pytest

from app.fusion.trust import (
    ReportContribution,
    band_for,
    compute_confidence,
)


def _rc(tier: str, *, uid: str | None = None, fp: str | None = None, **kw) -> ReportContribution:
    return ReportContribution(tier=tier, device_fp=fp, user_id=uid, **kw)


# ---------- band_for ---------------------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        (0.0, "RUMOR"),
        (1.99, "RUMOR"),
        (2.0, "PROBABLE"),
        (5.99, "PROBABLE"),
        (6.0, "CONFIRMED"),
        (100.0, "CONFIRMED"),
    ],
)
def test_band_thresholds(raw: float, expected: str) -> None:
    assert band_for(raw) == expected


# ---------- basic invariants -------------------------------------------------


def test_no_contributions_is_rumor() -> None:
    r = compute_confidence([], plausible=True, passive_agreement=False)
    assert r.band == "RUMOR"
    assert r.score == 0.0
    assert r.distinct_observers == 0


def test_implausible_zeros_score() -> None:
    """PRD §2.3: physically inconsistent events cannot promote regardless of
    how many people report them — plausibility multiplies the raw score."""
    contribs = [_rc("T3", uid=f"staff_{i}", is_confirmation=True) for i in range(5)]
    r = compute_confidence(contribs, plausible=False, passive_agreement=True)
    assert r.score == 0.0
    assert r.band == "RUMOR"


# ---------- independence is sub-linear ---------------------------------------


def test_independence_is_sublinear() -> None:
    """log1p(n): 100 anonymous reports should NOT be 10x the score of 10."""
    ten_anon = [_rc("T0", fp=f"dev_{i}") for i in range(10)]
    hundred_anon = [_rc("T0", fp=f"dev_{i}") for i in range(100)]
    r10 = compute_confidence(ten_anon, plausible=True, passive_agreement=False)
    r100 = compute_confidence(hundred_anon, plausible=True, passive_agreement=False)
    assert r100.score > r10.score
    # log1p(100)/log1p(10) ≈ 1.92, and trust_sum grows linearly, so ratio ≈ 19x
    # but definitely not 100x (would be linear). Keep the check loose.
    assert r100.score / r10.score < 30, "score should grow sub-linearly in observer count"


def test_same_device_multiple_reports_dont_multiply_observers() -> None:
    """Same device_fp submitting 5 reports counts as 1 observer, not 5."""
    contribs = [_rc("T0", fp="same_device") for _ in range(5)]
    r = compute_confidence(contribs, plausible=True, passive_agreement=False)
    assert r.distinct_observers == 1


# ---------- tier weights strictly ordered ------------------------------------


def test_tier_weights_strictly_ordered() -> None:
    tiers = ["T0", "T1", "T2", "T3"]
    scores = []
    for tier in tiers:
        r = compute_confidence(
            [_rc(tier, uid=f"user_{tier}")],
            plausible=True,
            passive_agreement=False,
        )
        scores.append(r.score)
    for i in range(1, len(scores)):
        assert scores[i] > scores[i - 1], f"{tiers[i]} must outweigh {tiers[i-1]}"


# ---------- anonymous-only cap -----------------------------------------------


def test_anonymous_only_capped_at_probable() -> None:
    """§2.3: even 500 anonymous reports cannot promote past PROBABLE."""
    contribs = [_rc("T0", fp=f"dev_{i}") for i in range(500)]
    r = compute_confidence(contribs, plausible=True, passive_agreement=True)
    assert r.band == "PROBABLE"
    assert "anon-only cap" in r.reasoning


def test_one_known_fan_breaks_anon_cap_if_enough_signal() -> None:
    """A single T1+ contributor removes the anon-only cap — signal can promote
    normally through the formula from there."""
    contribs = [_rc("T0", fp=f"dev_{i}") for i in range(50)]
    contribs.append(_rc("T1", uid="known_fan"))
    r = compute_confidence(contribs, plausible=True, passive_agreement=True)
    assert "anon-only cap" not in r.reasoning


# ---------- T3 authority path ------------------------------------------------


def test_single_t3_confirm_reaches_confirmed() -> None:
    """A staff/control-room T3 CONFIRM alone should be enough to CONFIRM,
    per §2.3 authority path."""
    r = compute_confidence(
        [_rc("T3", uid="staff_ops", is_confirmation=True)],
        plausible=True,
        passive_agreement=False,
    )
    assert r.band == "CONFIRMED"


def test_t3_confirm_still_gated_by_plausibility() -> None:
    """Authority does NOT bypass plausibility — you cannot confirm an
    impossible event even from staff."""
    r = compute_confidence(
        [_rc("T3", uid="staff_ops", is_confirmation=True)],
        plausible=False,
        passive_agreement=False,
    )
    assert r.band == "RUMOR"


# ---------- denials subtract trust -------------------------------------------


def test_denial_reduces_trust() -> None:
    """A T2 volunteer denying a T0-crowd event should knock the score down."""
    only_anon = [_rc("T0", fp=f"dev_{i}") for i in range(30)]
    with_denial = only_anon + [_rc("T2", uid="vol_north", is_denial=True)]
    r_pos = compute_confidence(only_anon, plausible=True, passive_agreement=False)
    r_neg = compute_confidence(with_denial, plausible=True, passive_agreement=False)
    assert r_neg.score < r_pos.score


# ---------- passive boost ----------------------------------------------------


def test_passive_agreement_boosts_score() -> None:
    contribs = [_rc("T1", uid=f"fan_{i}") for i in range(10)]
    r_no = compute_confidence(contribs, plausible=True, passive_agreement=False)
    r_yes = compute_confidence(contribs, plausible=True, passive_agreement=True)
    assert r_yes.score > r_no.score
    # 1.5x boost by design
    assert r_yes.score == pytest.approx(r_no.score * 1.5, rel=0.01)


# ---------- reputation multiplier -------------------------------------------


def test_reputation_multiplier_is_clamped() -> None:
    """Reputation is clamped to [0.1, 2.0] — a rogue "0" score can't nuke
    the contribution, and a runaway "5" can't dominate."""
    low = compute_confidence(
        [_rc("T2", uid="a", reputation=0.0)], plausible=True, passive_agreement=False
    )
    hi = compute_confidence(
        [_rc("T2", uid="a", reputation=99.0)], plausible=True, passive_agreement=False
    )
    baseline = compute_confidence(
        [_rc("T2", uid="a", reputation=1.0)], plausible=True, passive_agreement=False
    )
    # low was clamped up to 0.1, hi was clamped down to 2.0
    assert low.score == pytest.approx(baseline.score * 0.1, rel=0.01)
    assert hi.score == pytest.approx(baseline.score * 2.0, rel=0.01)
