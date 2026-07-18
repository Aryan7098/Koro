#!/usr/bin/env bash
set -euo pipefail

echo "[echostand] running migrations…"
alembic upgrade head

echo "[echostand] seeding venue graph + SOPs + demo users (idempotent)…"
python -m app.seed.load_all || echo "[echostand] seed step reported an issue — continuing"

echo "[echostand] starting uvicorn on :${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips "*"
