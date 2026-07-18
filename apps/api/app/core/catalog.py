"""Category catalog — loaded from packages/schemas/categories.json.

Single source of truth shared with the frontend. Categories carry a
severity bias (default severity if the model can't infer) and a
safety_critical flag that the action gate uses for the RUMOR-surface
asymmetry (§2.4).
"""
from __future__ import annotations

import json
from functools import lru_cache

from app.core.paths import repo_root

CATEGORIES_PATH = repo_root() / "packages" / "schemas" / "categories.json"


@lru_cache
def load_categories() -> dict[str, dict]:
    data = json.loads(CATEGORIES_PATH.read_text(encoding="utf-8"))
    return {c["id"]: c for c in data["categories"]}


def category(category_id: str) -> dict | None:
    return load_categories().get(category_id)


def is_safety_critical(category_id: str) -> bool:
    c = category(category_id)
    return bool(c and c.get("safety_critical"))


def default_severity(category_id: str) -> str:
    c = category(category_id)
    return (c or {}).get("severity_bias", "LOW")


def label(category_id: str, lang: str = "en") -> str:
    c = category(category_id) or {}
    labels = c.get("label", {})
    return labels.get(lang) or labels.get("en") or category_id
