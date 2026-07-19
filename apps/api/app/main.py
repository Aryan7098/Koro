"""FastAPI entrypoint.

Wires the lifespan (fusion tick worker + Redis close), CORS + security
headers, and mounts every feature router. Ordered top-down so a reader
can walk the module and see the whole surface in one screen.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.auth.routes import router as auth_router
from app.core.config import settings
from app.core.redis import close_redis
from app.fusion.worker import start_worker, stop_worker
from app.ingress.media import router as media_router
from app.ingress.reports import router as reports_router
from app.ingress.signals import router as signals_router
from app.organizer.routes import router as organizer_router
from app.realtime.routes import router as realtime_router
from app.simulator.routes import router as simulator_router
from app.staff.routes import router as staff_router
from app.state.routes import ledger_router, router as venue_router
from app.volunteer.routes import router as volunteer_router

log = logging.getLogger("echostand.startup")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach conservative security headers to every response.

    setdefault() so any router explicitly overriding a header (e.g. an
    embed-friendly page setting its own X-Frame-Options) still wins.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(self), camera=(self)",
        )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warn loudly if the deployment forgot to override the dev JWT secret —
    # otherwise every seeded username becomes a forgeable token.
    if settings.jwt_secret == "dev-secret-change-me":
        log.warning(
            "JWT_SECRET is the built-in dev default — tokens are forgeable. "
            "Set JWT_SECRET env var before exposing this deployment publicly."
        )
    start_worker()
    yield
    await stop_worker()
    await close_redis()


app = FastAPI(
    title="Koro API",
    version="0.1.0",
    description="Real-time crowd-sourced ground-truth fusion for FIFA 2026 venues.",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(reports_router)
app.include_router(signals_router)
app.include_router(media_router)
app.include_router(venue_router)
app.include_router(ledger_router)
app.include_router(simulator_router)
app.include_router(realtime_router)
app.include_router(staff_router)
app.include_router(volunteer_router)
app.include_router(organizer_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "Koro API",
        "version": "0.1.0",
        "docs": "/docs",
    }
