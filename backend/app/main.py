"""
main.py - FastAPI Application Entry Point & Router Assembly.

Purpose:
    Instantiates the FastAPI application, configures CORS middleware, executes
    lifespan startup routines (database table creation and multi-tenant migration),
    and mounts all REST/WS routers (including SaaS billing & entitlements).

Role in the project:
    The top-level server module executed by Uvicorn to serve backend requests and WebSocket traffic.

Key contents:
    - lifespan(): Startup/shutdown async context manager initializing database tables.
    - app: FastAPI application instance mounted with routes_sim, routes_map, routes_runs,
      routes_compare, routes_auth, routes_billing, and ws routers.
    - GET /api/health: Service heartbeat endpoint.

Talks to:
    - uvicorn: ASGI server running this application.
    - app.api.*: Aggregates and mounts all route modules.
    - app.db.session: Calls init_db() on startup.
"""

from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings, PRODUCT_NAME
from app.db.session import init_db
from app.api import (
    routes_sim,
    routes_map,
    routes_runs,
    routes_compare,
    routes_auth,
    routes_billing,
    routes_team,
    routes_keys,
    routes_v1,
    routes_admin,
    ws,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialise DB and run multi-tenant migrations on startup."""
    init_db()
    yield
    # Cleanup on shutdown
    from app.core.simulator import simulator
    simulator.running = False


app = FastAPI(
    title=f"{PRODUCT_NAME} API",
    description=(
        f"{PRODUCT_NAME} Autonomous Fleet Simulator with AI Path Planning, "
        "Swarm Coordination, and Multi-Tier Subscription SaaS. All planning logic runs on this backend."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS – allow the Next.js dev server and any Docker network origin
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(routes_sim.router)
app.include_router(routes_map.router)
app.include_router(routes_runs.router)
app.include_router(routes_compare.router)
app.include_router(routes_auth.router)
app.include_router(routes_billing.router)
app.include_router(routes_team.router)
app.include_router(routes_keys.router)
app.include_router(routes_v1.router)
app.include_router(routes_admin.router)
app.include_router(ws.router)


@app.get("/api/health")
@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": f"{PRODUCT_NAME.lower()}-backend",
        "product_name": PRODUCT_NAME,
        "billing_provider": settings.billing_provider,
        "test_mode": True,
    }
