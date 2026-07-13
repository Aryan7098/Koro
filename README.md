# EchoStand

Real-time crowd-sourced ground-truth fusion engine for FIFA World Cup 2026 venues.
Fans, volunteers, staff, and organizers all *report* observations in any language and
any form; GenAI fuses tens of thousands of noisy, multilingual, partly-false human
reports into one trusted live picture, then speaks that single picture back to each
audience in its own register and language.

See `../EchoStand_Architecture_and_PRD.md` for the full thesis and design.
Build plan lives at `~/.claude/plans/luminous-coalescing-sutton.md`.

**Status: v1 — first end-to-end demoable loop (Milestones 1–6 complete).**

## What's in v1

- **Ingress (M2):** fan / volunteer / staff / passive-signal endpoints, MinIO media, role-picker JWT + anonymous fan-session, per-device rate limits.
- **Simulator (M3):** three scripted scenarios — `demo_full_narrative`, `safety_critical_asymmetry`, `collusion` — driven via the `/simulator/*` API.
- **Fusion pipeline (M4):** Haiku 4.5 batch normalize + geo-resolve; local `bge-m3` embeddings; cross-lingual clustering; trust-weighted confidence (PRD §2.3); Sonnet 5 severity inference with Redis-backed source-set caching.
- **Action gate (M5):** the confidence × severity matrix from PRD §2.4, including the RUMOR/safety-critical surface-early asymmetry and the PendingAuthorization queue for FR11.
- **Rendering + SSE (M6):** Sonnet 5 multi-language fan nudge (all 6 languages in one call, prompt-cached Venue Graph + SOPs), staff work-order, volunteer script; in-process pub/sub → SSE fan-out on `/realtime/{fan,volunteer,staff,organizer}`.
- **Fan surface:** minimal Next.js page — one-tap category tiles, language + location picker, live nudge stream.
- **Traceability:** `GET /events/{id}/lineage` returns every input report + normalization + gate decision + rendered output for any Canonical Event (Design Commitment #4).

## Not yet in v1

M7 (full fan polish), M8 (staff + Authorize UI), M9 (volunteer surface), M10 (accessibility re-plan on wheelchair fan), M11 (loop closure notifications), M12 (organizer map + control UI), M13 (final polish + §3.10 demo wiring end-to-end).

## Layout

```
echostand/
  apps/api/        FastAPI backend (Python 3.12)
  apps/web/        Next.js 15 frontend (TypeScript, PWA)
  packages/schemas Shared JSON Schemas
  data/            Venue graph, SOPs, simulator scenarios
  docker-compose.yml
```

## Quick start (Windows / PowerShell)

```powershell
# 0. Prereqs: Docker Desktop, Python 3.12, Node 20+
docker --version; python --version; node --version

# 1. Copy env template
copy .env.example apps\api\.env
#    then edit apps\api\.env and set ANTHROPIC_API_KEY=…

# 2. Infra
docker compose up -d

# 3. Backend
cd apps\api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
python -m app.seed.load_all
uvicorn app.main:app --reload --port 8000

# 4. Frontend (new terminal)
cd ..\..\apps\web
npm install
npm run dev  # http://localhost:3000
```

Without `ANTHROPIC_API_KEY`, the pipeline runs in **graceful-degradation mode**: normalize and rendering emit `UNCERTAIN` fallback output rather than fabricating — per Design Commitment #5.

## Demoing the loop

1. Open http://localhost:3000/fan in one window, pick a language + location.
2. Log in as staff at http://localhost:3000 (username `staff_ops`) — grab the JWT from `/auth/login` in the DevTools network tab.
3. Trigger a scenario:
   ```bash
   curl -X POST http://localhost:8000/simulator/run \
     -H "authorization: bearer $JWT" \
     -H "content-type: application/json" \
     -d '{"name":"demo_full_narrative"}'
   ```
4. Watch nudges arrive on `/fan` and check `/simulator/status` for the step log.

## Design commitments (from PRD Part 0)

1. Never invent venue facts — all spatial/route/capacity facts come from the Venue Graph.
2. Corroboration gates action — nothing consequential on a single anonymous tap (except safety-critical, which surfaces early — see the matrix in `apps/api/app/gate/decide.py`).
3. Humans authorize anything consequential — model curates, humans decide (FR11 queue in the `pending_authorizations` table).
4. Every rendered instruction is traceable via `GET /events/{id}/lineage`.
5. Uncertain → say less, not more.
