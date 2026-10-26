"""
routes_v1.py - Versioned Public REST API (v1).

Purpose:
    Exposes external, headless endpoints for CI/CD pipelines, automated testing,
    and programmatic robotics evaluation using hashed API keys.

Endpoints:
    - POST /api/v1/simulations/run (Scope: 'write') -> Executes a headless multi-robot simulation
    - POST /api/v1/planners/compare (Scope: 'read') -> Benchmarks A* vs. Dijkstra on given map
    - GET  /api/v1/runs/{run_id}    (Scope: 'read') -> Retrieves historical simulation metrics
    - GET  /api/v1/health           -> Public API status check
"""

from __future__ import annotations
import time
import secrets
import hashlib
from typing import Dict, List, Literal, Optional
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import ApiKey, Organization, SimRun, AuditLog
from app.billing.entitlements import (
    get_entitlements,
    increment_monthly_usage,
    get_monthly_usage,
)
from app.core.simulator import Simulator, SimConfig
from app.planning.astar import astar
from app.planning.dijkstra import dijkstra
from app.core.map_generator import get_preset

router = APIRouter(prefix="/api/v1", tags=["public-v1"])

# In-memory sliding-window rate limit tracker: key_hash -> list of timestamps
_RATE_LIMIT_WINDOWS: Dict[str, List[float]] = defaultdict(list)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_api_key(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> tuple[ApiKey, Organization]:
    """
    Validates the Bearer API key, updates usage telemetry, and enforces
    per-minute rate limits based on the organization's plan.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Bearer token. Use 'Authorization: Bearer ws_live_...'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = authorization.replace("Bearer ", "").strip()
    token_hash = _hash_token(raw_token)

    api_key: Optional[ApiKey] = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == token_hash, ApiKey.revoked == False)
        .first()
    )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key.",
        )

    org: Optional[Organization] = (
        db.query(Organization).filter(Organization.id == api_key.org_id).first()
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Organization associated with this API key no longer exists.",
        )

    # Resolve Plan Entitlements
    entitlements = get_entitlements(org, db)
    plan = entitlements.plan_id

    # Rate limiting thresholds (requests per minute)
    # Free: 0 (locked)
    # Pro: 60 req/min
    # Team: 300 req/min
    # Enterprise: 10,000 req/min (effectively unlimited)
    rate_limits = {
        "free": 0,
        "pro": 60,
        "team": 300,
        "enterprise": 10000,
    }
    max_per_min = rate_limits.get(plan, 60)

    now = time.time()
    window = _RATE_LIMIT_WINDOWS[token_hash]
    # Prune timestamps older than 60 seconds
    valid_window = [t for t in window if now - t < 60.0]
    _RATE_LIMIT_WINDOWS[token_hash] = valid_window

    if len(valid_window) >= max_per_min:
        oldest = valid_window[0]
        retry_after = max(1, int(60.0 - (now - oldest)))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded ({max_per_min} requests/minute for {plan.upper()} tier).",
            headers={"Retry-After": str(retry_after)},
        )

    _RATE_LIMIT_WINDOWS[token_hash].append(now)

    # Monthly Quota Checks
    monthly_limit = 10000 if plan in ("team", "enterprise") else 1000
    used_calls = get_monthly_usage(org.id, "api_calls", db)
    if used_calls >= monthly_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Monthly API call quota of {monthly_limit} exceeded for {plan.upper()} tier.",
        )

    # Consume 1 API call
    increment_monthly_usage(org.id, "api_calls", amount=1, db=db)

    # Update last_used_at timestamp
    api_key.last_used_at = datetime.utcnow()
    db.commit()

    return api_key, org


def require_scope(required_scope: str):
    """Dependency factory checking if the API key contains the required scope."""
    def _scope_checker(auth: tuple[ApiKey, Organization] = Depends(verify_api_key)):
        api_key, org = auth
        scopes = api_key.scopes or ["read"]
        if required_scope not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing required scope '{required_scope}'. Granted scopes: {scopes}",
            )
        return api_key, org
    return _scope_checker


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class HeadlessRunRequest(BaseModel):
    map_preset: str = Field(default="warehouse", description="Map template identifier")
    num_robots: int = Field(default=5, ge=1, le=30, description="Fleet size")
    planner: Literal["astar", "dijkstra"] = "astar"
    coordination_mode: Literal["swarm", "naive"] = "swarm"
    max_ticks: int = Field(default=150, ge=10, le=500, description="Max execution ticks")
    seed: Optional[int] = Field(default=42, description="RNG seed for deterministic replay")


class PlannerCompareV1Request(BaseModel):
    map_preset: str = Field(default="warehouse")
    start: List[int] = Field(default=[1, 1], description="[row, col] origin")
    goal: List[int] = Field(default=[10, 10], description="[row, col] destination")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health")
def v1_health():
    """Health check for public API v1."""
    return {
        "status": "healthy",
        "version": "v1",
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/simulations/run")
def run_headless_simulation(
    req: HeadlessRunRequest,
    auth: tuple[ApiKey, Organization] = Depends(require_scope("write")),
    db: Session = Depends(get_db),
):
    """
    Executes a multi-robot warehouse simulation headlessly in Python.
    Requires 'write' scope. Automatically persists metrics and event traces.
    """
    api_key, org = auth
    entitlements = get_entitlements(org, db)

    # Validate robot limits against plan
    max_allowed_robots = entitlements.limits.get("robots", 5)
    if req.num_robots > max_allowed_robots:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "PLAN_LIMIT",
                "limit": "robots",
                "current": req.num_robots,
                "max_allowed": max_allowed_robots,
                "message": f"Organization plan ({entitlements.plan_id.upper()}) allows up to {max_allowed_robots} robots.",
            },
        )

    # Run headless simulation engine
    sim = Simulator()
    cfg = SimConfig(
        num_robots=req.num_robots,
        planner=req.planner,
        coordination=req.coordination_mode,
        seed=req.seed,
        map_preset=req.map_preset,
    )
    sim.configure(cfg)
    sim.reset()

    timed_out = False
    start_time = time.perf_counter()
    for _ in range(req.max_ticks):
        sim._tick_once()
        if time.perf_counter() - start_time > 10.0:  # 10s cutoff
            timed_out = True
            break

    state = sim.get_state()
    metrics = state["metrics"]

    # Persist run to database linked to this organization
    run = SimRun(
        org_id=org.id,
        map_preset=req.map_preset,
        coordination=req.coordination_mode,
        planner=req.planner,
        num_robots=req.num_robots,
        seed=req.seed,
        total_ticks=sim.tick,
        metrics=metrics,
        notes=f"Headless v1 API execution via key '{api_key.name}'",
        share_token=secrets.token_urlsafe(16),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    return {
        "status": "success",
        "run_id": run.id,
        "share_token": run.share_token,
        "total_ticks": sim.tick,
        "timed_out": timed_out,
        "metrics": metrics,
        "recent_events": sim.events_log[-50:],
    }


@router.post("/planners/compare")
def compare_planners_v1(
    req: PlannerCompareV1Request,
    auth: tuple[ApiKey, Organization] = Depends(require_scope("read")),
    db: Session = Depends(get_db),
):
    """
    Executes A* and Dijkstra head-to-head on the requested map preset and coordinates.
    Requires 'read' scope.
    """
    api_key, org = auth

    # Load map preset grid
    grid = get_preset(req.map_preset)
    if not grid:
        grid = get_preset("warehouse")
    start = (req.start[0], req.start[1])
    goal = (req.goal[0], req.goal[1])

    # Run A*
    t0 = time.perf_counter()
    astar_res = astar(grid, start, goal, heuristic="manhattan", connectivity=4)
    astar_time = (time.perf_counter() - t0) * 1000.0

    # Run Dijkstra
    t0 = time.perf_counter()
    dijkstra_res = dijkstra(grid, start, goal, connectivity=4)
    dijkstra_time = (time.perf_counter() - t0) * 1000.0

    return {
        "map_preset": req.map_preset,
        "start": start,
        "goal": goal,
        "astar": {
            "success": astar_res.success,
            "path_length": len(astar_res.path),
            "cost": astar_res.cost,
            "expanded_nodes": astar_res.expanded_nodes,
            "runtime_ms": round(astar_time, 2),
        },
        "dijkstra": {
            "success": dijkstra_res.success,
            "path_length": len(dijkstra_res.path),
            "cost": dijkstra_res.cost,
            "expanded_nodes": dijkstra_res.expanded_nodes,
            "runtime_ms": round(dijkstra_time, 2),
        },
        "search_efficiency_gain_pct": round(
            ((dijkstra_res.expanded_nodes - astar_res.expanded_nodes) / max(1, dijkstra_res.expanded_nodes)) * 100, 1
        ),
    }


@router.get("/runs/{run_id}")
def get_run_v1(
    run_id: int,
    auth: tuple[ApiKey, Organization] = Depends(require_scope("read")),
    db: Session = Depends(get_db),
):
    """Retrieves full metrics and execution details for a historical simulation run."""
    api_key, org = auth
    run = db.query(SimRun).filter(SimRun.id == run_id, SimRun.org_id == org.id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run #{run_id} not found in this organization.",
        )

    return {
        "run_id": run.id,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "map_preset": run.map_preset,
        "coordination": run.coordination,
        "planner": run.planner,
        "num_robots": run.num_robots,
        "seed": run.seed,
        "total_ticks": run.total_ticks,
        "metrics": run.metrics,
        "share_token": run.share_token,
    }
