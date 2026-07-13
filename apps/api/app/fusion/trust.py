"""Trust-weight & confidence scoring (PRD §2.3).

Pure functions — deterministic, unit-testable, no I/O.

The formula::

    independence  = log1p(distinct_observers)
    trust_sum     = Σ tier_weight(source) over reports, T3-confirm hard-caps HIGH
    passive_boost = 1 + 0.5 · passive_signal_agreement
    plausibility  = 1 if physically consistent with Venue Graph else 0
    raw           = plausibility · independence · trust_sum · passive_boost
    band          = RUMOR (raw<2) | PROBABLE (2 ≤ raw < 6) | CONFIRMED (raw ≥ 6)

    # Anonymous-only clusters hard-cap at PROBABLE regardless of volume (§2.3 anti-spam).
    # Volunteer/staff DENY inverts contribution (subtracts trust weight).
"""
from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass


TIER_WEIGHT = {
    "T0": 0.4,   # anonymous — slow, asymptotic
    "T1": 0.9,   # known fan
    "T2": 2.5,   # role-verified volunteer
    "T3": 6.0,   # staff / control room (T3 CONFIRM alone can carry the event)
}


@dataclass(frozen=True)
class ReportContribution:
    tier: str
    device_fp: str | None
    user_id: str | None
    is_confirmation: bool = False  # volunteer/staff explicit confirm
    is_denial: bool = False        # volunteer/staff explicit deny
    reputation: float = 1.0        # per-user reputation multiplier (default neutral)


@dataclass(frozen=True)
class ConfidenceResult:
    band: str            # "RUMOR" | "PROBABLE" | "CONFIRMED"
    score: float         # raw score (post cap)
    distinct_observers: int
    tier_counts: dict[str, int]
    plausible: bool
    passive_agreement: bool
    reasoning: str


def band_for(raw: float) -> str:
    if raw < 2.0:
        return "RUMOR"
    if raw < 6.0:
        return "PROBABLE"
    return "CONFIRMED"


def compute_confidence(
    contributions: Iterable[ReportContribution],
    *,
    plausible: bool,
    passive_agreement: bool,
) -> ConfidenceResult:
    contribs = list(contributions)
    if not contribs:
        return ConfidenceResult(
            band="RUMOR",
            score=0.0,
            distinct_observers=0,
            tier_counts={},
            plausible=plausible,
            passive_agreement=passive_agreement,
            reasoning="no contributions",
        )

    # Independence — unique (user_id OR device_fp)
    observers: set[str] = set()
    tier_counts: dict[str, int] = {"T0": 0, "T1": 0, "T2": 0, "T3": 0}
    trust_sum = 0.0
    t3_confirm = False
    net_deny = 0.0

    for c in contribs:
        observer_key = c.user_id or c.device_fp or "anon"
        observers.add(observer_key)
        tier_counts[c.tier] = tier_counts.get(c.tier, 0) + 1
        weight = TIER_WEIGHT.get(c.tier, 0.0) * max(0.1, min(2.0, c.reputation))
        if c.is_denial:
            net_deny += weight  # denials subtract trust
        else:
            trust_sum += weight
            if c.is_confirmation and c.tier == "T3":
                t3_confirm = True

    distinct = len(observers)
    independence = math.log1p(distinct)  # sub-linear
    trust_effective = max(0.0, trust_sum - net_deny)
    passive_boost = 1.5 if passive_agreement else 1.0
    plausibility = 1.0 if plausible else 0.0

    raw = plausibility * independence * trust_effective * passive_boost

    # Direct authority path — a T3 confirmation is enough to reach CONFIRMED,
    # otherwise T3 reports still contribute normally through the formula above.
    if plausible and t3_confirm and raw < 6.0:
        raw = max(raw, 6.0)

    # §2.3 anti-spam: anonymous-only clusters cap at PROBABLE regardless of volume.
    anon_only = tier_counts.get("T0", 0) > 0 and (
        tier_counts.get("T1", 0) == 0
        and tier_counts.get("T2", 0) == 0
        and tier_counts.get("T3", 0) == 0
    )
    if anon_only and raw >= 6.0:
        raw = 5.99  # just below CONFIRMED threshold

    band = band_for(raw)

    reasoning = (
        f"observers={distinct} tiers={tier_counts} "
        f"trust_sum={trust_sum:.2f} deny={net_deny:.2f} "
        f"passive={'yes' if passive_agreement else 'no'} "
        f"plausible={'yes' if plausible else 'no'} → raw={raw:.2f} → {band}"
    )
    if anon_only:
        reasoning += " [anon-only cap]"
    if t3_confirm:
        reasoning += " [T3-confirm authority]"

    return ConfidenceResult(
        band=band,
        score=raw,
        distinct_observers=distinct,
        tier_counts=tier_counts,
        plausible=plausible,
        passive_agreement=passive_agreement,
        reasoning=reasoning,
    )
