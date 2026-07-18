# EchoStand

Real-time crowd-sourced ground-truth fusion engine for FIFA World Cup 2026 venues.
Fans, volunteers, staff, and organizers all *report* observations in any language and
any form; GenAI fuses tens of thousands of noisy, multilingual, partly-false human
reports into one trusted live picture, then speaks that single picture back to each
audience in its own register and language.

See `../EchoStand_Architecture_and_PRD.md` for the full thesis.
Build plan: `~/.claude/plans/luminous-coalescing-sutton.md`.

**Status: all 13 milestones landed.**

## What's here

| Milestone | Feature | Where |
|---|---|---|
| M1 | Repo scaffold, docker-compose, DB schema, MetLife Venue Graph + SOP corpus + demo users seed | `docker-compose.yml`, `apps/api/alembic/versions/0001_initial.py`, `data/` |
| M2 | Ingress endpoints (fan/volunteer/staff/passive/media) with JWT + anonymous fan session + per-device rate limits | `apps/api/app/ingress/`, `apps/api/app/auth/` |
| M3 | Scenario simulator (`demo_full_narrative`, `safety_critical_asymmetry`, `collusion`) | `apps/api/app/simulator/`, `data/scenarios/` |
| M4 | Fusion pipeline: Haiku batch normalize + geo-resolve, bge-m3 embeddings, cross-lingual clustering, trust-weighted confidence (PRD §2.3), Sonnet severity inference with Redis source-set cache | `apps/api/app/fusion/`, `apps/api/app/llm/` |
| M5 | Action gate — confidence × severity matrix (PRD §2.4), safety-critical surface-early asymmetry, `pending_authorizations` queue (FR11) | `apps/api/app/gate/decide.py` |
| M6 | Rendering layer + SSE fan-out — Sonnet multi-language fan nudge (all 6 languages/call, prompt-cached Venue Graph + SOPs), staff work-order, volunteer script | `apps/api/app/rendering/`, `apps/api/app/realtime/` |
| M7 | Fan surface polish — persona picker, accessibility drawer, category tiles, nudge cards, media upload | `apps/web/app/fan/`, `apps/web/components/{PersonaPicker,AccessibilityDrawer,CategoryGrid,NudgeCard,MediaAttach}.tsx` |
| M8 | Staff console + Authorize queue (FR11) — three tabs, red-bordered CRITICAL cards, evidence lineage drill-down | `apps/api/app/staff/`, `apps/web/app/staff/`, `apps/web/components/EvidencePanel.tsx` |
| M9 | Volunteer surface — verify queue + confirm/deny + live scripts | `apps/api/app/volunteer/`, `apps/web/app/volunteer/` |
| M10 | Accessibility re-generation (FR8) — Dijkstra path planner injected into the fan render, `GET /venue/plan` diagnostic | `apps/api/app/rendering/pathplan.py`, `apps/api/app/rendering/fan.py` |
| M11 | Loop closure notifications (FR6) — per-language "fixed, thanks" to every fan who reported an event | `apps/api/app/rendering/closure.py` |
| M12 | Organizer surface + control panel — live venue map (SVG), success metrics, patterns table, simulator driver | `apps/api/app/organizer/`, `apps/web/app/{organizer,control}/`, `apps/web/components/VenueMap.tsx` |
| M13 | §3.10 narrative end-to-end + polish | this file + landing page |

## Layout

```
echostand/
  apps/api/           FastAPI backend (Python 3.12)
    app/
      auth/           JWT + role-picker + anonymous fan sessions
      core/           config, DB, Redis, category catalog
      fusion/         normalize · embed · geo-resolve · cluster · trust · severity · worker
      gate/           confidence × severity action gate
      rendering/      fan / staff / volunteer / closure + accessibility pathplan
      realtime/       SSE pub/sub bus + routes
      state/          venue graph reads + /events/{id}/lineage
      ingress/        report + passive + media endpoints
      staff/          dispatch / authorize / resolve
      volunteer/      tasks / confirm / deny / scripts
      organizer/      metrics / patterns / live
      simulator/      scenario runner + routes
      seed/           idempotent seed script
    alembic/          migrations
  apps/web/           Next.js 15 App Router (TS, PWA)
    app/{fan,volunteer,staff,organizer,control}/  role surfaces
    components/       PersonaPicker · AccessibilityDrawer · CategoryGrid · NudgeCard ·
                      MediaAttach · StaffLogin · EvidencePanel · VenueMap
    lib/              api client + category catalog
  data/               MetLife venue graph, SOP corpus, simulator scenarios
  packages/schemas/   shared JSON schema (categories)
  docker-compose.yml  Postgres 16 + pgvector · Redis 7 · MinIO
```

## Quick start (Windows / PowerShell)

```powershell
# 0. Prereqs: Docker Desktop, Python 3.12, Node 20+
docker --version; python --version; node --version

# 1. Copy env template + set ANTHROPIC_API_KEY
copy .env.example apps\api\.env
# then edit apps\api\.env

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

Without `ANTHROPIC_API_KEY`, the pipeline runs in **graceful-degradation mode**: normalize / severity / render emit `UNCERTAIN` fallback output rather than fabricating — per Design Commitment #5. Loop closure has canned per-language templates so it still works.

## Demo runbook (§3.10)

Open three browser windows/tabs:

- **Fan** — http://localhost:3000/fan, log in as `Jamil` (Arabic + mobility) or `María` (Spanish).
- **Staff** — http://localhost:3000/staff, log in as `Ops Control`. Keep the **Authorize** tab visible.
- **Control** — http://localhost:3000/control, log in as `Match Organizer`, click **Run** on `demo_full_narrative`.

You should see:

1. Ambient fan reports arrive; the fusion tick clusters them.
2. Spill @ Section 112 escalates **RUMOR → PROBABLE** (multiple independent observers) → **CONFIRMED** after the volunteer confirms.
3. Fan surface shows a nudge in the current language. Jamil (mobility) sees a **planned step-free route** away from `restroom_112` toward `restroom_119`.
4. Staff dispatch queue populates. Volunteer script is available on `/volunteer` if you sign in there.
5. Halfway through, a **medical** report lands from an anonymous fan at Section 324 — it shows up **immediately as a red-bordered CRITICAL card in the Authorize queue**, because safety-critical events bypass the corroboration gate (§2.4 asymmetry).
6. Staff resolves the spill; every fan who reported it gets a green **✓ RESOLVED** card in their language ("in N minutes — your report helped").
7. Organizer view (http://localhost:3000/organizer) shows the venue map with heat, and the patterns table starts populating.

Also worth running:

- `collusion` — 40 reports from 3 personas at Gate C. The event never leaves RUMOR (sub-linear independence + T0 anonymous cap + throughput sensor contradiction). Visible on the organizer view under "manipulation suppressed" metric.
- `safety_critical_asymmetry` — a single anonymous medical report lands in the Authorize queue within one fusion tick.

## Design commitments (from PRD Part 0)

1. Never invent venue facts — the Dijkstra planner + Venue Graph are the sole sources of routes and node names. Claude only phrases them.
2. Corroboration gates action — nothing consequential on a single anonymous tap (except safety-critical, which surfaces early via the asymmetry rule).
3. Humans authorize anything consequential — the model *proposes*, the FR11 Authorize queue is where humans decide.
4. Every rendered instruction is traceable — `GET /events/{id}/lineage` returns the full lineage; the staff/organizer/volunteer surfaces expose the same.
5. Uncertain → say less, not more — graceful degradation without an API key, `UNCERTAIN` when the model isn't confident.

## Endpoint index

```
auth        POST /auth/login             role-picker JWT
            POST /auth/fan-session       anon device fingerprint
            GET  /auth/me                current user
            PATCH /auth/me               update language / home / accessibility

ingress     POST /reports/fan            anon-capable
            POST /reports/volunteer      (+ confirm/deny)
            POST /reports/staff          (+ state_set)
            POST /signals/passive        density / throughput / weather / …
            POST /media                  photo/voice upload to MinIO
            GET  /reports/events/active  active-event snapshot

fusion      (worker runs on FUSION_TICK_SECONDS heartbeat)

state       GET  /venue/graph            full nodes + edges
            GET  /venue/plan             Dijkstra reroute diagnostic
            GET  /events/{id}/lineage    traceability (Design Commitment #4)

staff       GET  /staff/queue            dispatch by (severity, band)
            GET  /staff/authorize        FR11 queue
            GET  /staff/resolve          engaged events
            POST /staff/authorize/{id}/approve
            POST /staff/authorize/{id}/deny
            POST /staff/events/{id}/resolve → fires loop closure

volunteer   GET  /volunteer/tasks        verify queue
            GET  /volunteer/scripts      recent scripts (ledger tail)
            POST /volunteer/confirm
            POST /volunteer/deny

organizer   GET  /organizer/metrics      §3.8 numbers
            GET  /organizer/patterns     (category × node) buckets
            GET  /organizer/live         active events + node coordinates

simulator   GET  /simulator/scenarios
            POST /simulator/run
            POST /simulator/stop
            POST /simulator/inject
            GET  /simulator/status

realtime    GET  /realtime/fan?device_fp|user_id
            GET  /realtime/volunteer?user_id
            GET  /realtime/staff?user_id
            GET  /realtime/organizer
```
