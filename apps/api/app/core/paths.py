"""Repo-root resolution that works in both local dev and Docker.

Local layout (from apps/api/app/*/module.py):
    parents[4] = echostand/                (the repo root)
Docker layout (from /app/app/*/module.py):
    parents[3] = /                         (data/ + packages/ COPY'd to /)

Instead of counting parents, we walk up looking for a well-known marker
file. Also honors an ``ECHOSTAND_ROOT`` env var for tests or unusual
layouts.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

MARKER = Path("data") / "metlife_venue.json"


@lru_cache(maxsize=1)
def repo_root() -> Path:
    override = os.environ.get("ECHOSTAND_ROOT")
    if override:
        p = Path(override)
        if p.is_dir():
            return p

    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / MARKER).exists():
            return parent

    # Absolute last resort: assume data/ lives one level below FS root
    # (mirrors the Docker COPY target).
    if (Path("/") / MARKER).exists():
        return Path("/")

    raise RuntimeError(
        f"could not locate the EchoStand repo root (marker: {MARKER}). "
        f"Set ECHOSTAND_ROOT if running from an unusual layout."
    )
