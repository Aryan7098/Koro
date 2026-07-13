from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.routes import router as auth_router
from app.core.config import settings
from app.core.redis import close_redis
from app.fusion.worker import start_worker, stop_worker
from app.ingress.media import router as media_router
from app.ingress.reports import router as reports_router
from app.ingress.signals import router as signals_router
from app.realtime.routes import router as realtime_router
from app.simulator.routes import router as simulator_router
from app.state.routes import ledger_router, router as venue_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — kick off the fusion tick loop
    start_worker()
    yield
    # Shutdown
    await stop_worker()
    await close_redis()


app = FastAPI(
    title="EchoStand API",
    version="0.1.0",
    description="Real-time crowd-sourced ground-truth fusion for FIFA 2026 venues.",
    lifespan=lifespan,
)

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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "name": "EchoStand API",
        "version": "0.1.0",
        "docs": "/docs",
    }
