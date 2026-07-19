"""Pytest bootstrap.

Adds the api package root to sys.path so `from app.<x> import <y>` works
whether pytest is invoked from the repo root or from apps/api.
"""
from __future__ import annotations

import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))
