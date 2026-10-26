"""
routes_runs.py - Simulation Run History & Saved Runs REST API Endpoints.

Purpose:
    Provides endpoints for saving, querying, retrieving, and comparing historical
    simulation execution records, metrics snapshots, and event logs.

Role in the project:
    The analytics persistence interface powering the Run History page and legacy
    ID-based run comparisons.

Key contents:
    - GET /api/runs: Lists up to 100 historical runs with metadata, seeds, and KPI summaries.
    - GET /api/runs/{id}: Returns detailed metrics snapshot and sampled event logs for a run.
    - POST /api/runs/save: Snapshots current active simulation state and commits to SQLite.
    - POST /api/runs/compare: Compares two or more saved runs side-by-side by ID.
    - DELETE /api/runs/{id}: Removes a run from the history database.

Talks to:
    - app.db.models.SimRun: Database model storing run records.
    - app.core.simulator.Simulator: Queries current metrics and config for snapshotting.
    - frontend/app/history/page.tsx: History table UI.
"""

from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
import secrets
from app.db.models import SimRun, Organization
from app.billing.entitlements import get_current_org, get_entitlements, require_feature
from app.core.simulator import simulator

router = APIRouter(prefix="/api/runs", tags=["runs"])


class SaveRunRequest(BaseModel):
    notes: Optional[str] = None


@router.get("")
async def list_runs(
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
):
    """Return all saved simulation runs (most recent first)."""
    ent = get_entitlements(org, db)
    max_saved = ent.get_limit("saved_runs", 5)
    limit_val = 100 if max_saved == -1 else max(1, min(100, max_saved))
    runs = db.query(SimRun).filter((SimRun.org_id == org.id) | (SimRun.org_id == None)).order_by(SimRun.created_at.desc()).limit(limit_val).all()
    return [
        {
            "id": r.id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "map_preset": r.map_preset,
            "coordination": r.coordination,
            "planner": r.planner,
            "num_robots": r.num_robots,
            "seed": r.seed,
            "total_ticks": r.total_ticks,
            "metrics": r.metrics,
            "notes": r.notes,
        }
        for r in runs
    ]


@router.get("/{run_id}")
async def get_run(run_id: int, db: Session = Depends(get_db)):
    """Return full details of a saved run."""
    run = db.query(SimRun).filter(SimRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    return {
        "id": run.id,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "map_preset": run.map_preset,
        "coordination": run.coordination,
        "planner": run.planner,
        "heuristic": run.heuristic,
        "connectivity": run.connectivity,
        "num_robots": run.num_robots,
        "seed": run.seed,
        "total_ticks": run.total_ticks,
        "speed": run.speed,
        "task_rate": run.task_rate,
        "metrics": run.metrics,
        "event_log": run.event_log,
        "notes": run.notes,
    }


@router.post("/save")
async def save_current_run(
    req: SaveRunRequest,
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
):
    """Persist the current simulation run to the database."""
    cfg = simulator.config
    state = simulator.get_state()
    metrics = state.get("metrics", {})

    run = SimRun(
        org_id=org.id,
        share_token=secrets.token_urlsafe(16),
        map_preset=cfg.map_preset,
        coordination=cfg.coordination,
        planner=cfg.planner,
        heuristic=cfg.heuristic,
        connectivity=cfg.connectivity,
        num_robots=cfg.num_robots,
        seed=cfg.seed,
        total_ticks=simulator.tick,
        speed=cfg.speed,
        task_rate=cfg.task_rate,
        metrics=metrics,
        event_log=simulator.events_log[-200:],
        notes=req.notes,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return {"id": run.id, "status": "saved"}


@router.post("/compare")
async def compare_runs(
    run_ids: list[int],
    db: Session = Depends(get_db),
    _gate = Depends(require_feature("benchmarks_compare")),
):
    """Return metrics for multiple runs side by side."""
    runs = db.query(SimRun).filter(SimRun.id.in_(run_ids)).all()
    if not runs:
        raise HTTPException(404, "No runs found")
    return [
        {
            "id": r.id,
            "coordination": r.coordination,
            "planner": r.planner,
            "num_robots": r.num_robots,
            "seed": r.seed,
            "metrics": r.metrics,
            "notes": r.notes,
        }
        for r in runs
    ]


@router.delete("/{run_id}")
async def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(SimRun).filter(SimRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    db.delete(run)
    db.commit()
    return {"status": "deleted"}

@router.get("/shared/{token}")
async def get_shared_run(token: str, db: Session = Depends(get_db)):
    """Public read-only run viewer accessed via unguessable share token (Pro+ feature)."""
    run = db.query(SimRun).filter(SimRun.share_token == token).first()
    if not run:
        raise HTTPException(404, "Shared run not found or link has expired")
    return {
        "id": run.id,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "map_preset": run.map_preset,
        "coordination": run.coordination,
        "planner": run.planner,
        "heuristic": run.heuristic,
        "connectivity": run.connectivity,
        "num_robots": run.num_robots,
        "seed": run.seed,
        "total_ticks": run.total_ticks,
        "speed": run.speed,
        "task_rate": run.task_rate,
        "metrics": run.metrics,
        "event_log": run.event_log,
        "notes": run.notes,
        "is_shared": True,
    }
