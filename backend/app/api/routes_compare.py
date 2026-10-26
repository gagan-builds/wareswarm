"""
routes_compare.py - Headless Simulation Benchmark & Planner Comparison REST API.

Purpose:
    Provides automated, 1-click comparison endpoints for evaluating NAIVE vs. SWARM
    coordination on identical seeds and visualizing A* vs. Dijkstra search metrics.

Role in the project:
    The scientific evaluation backend supporting the Compare page (/compare).
    Runs simulations headlessly without real-time delays to produce instant viva results.

Key contents:
    - POST /api/compare/modes: Executes NAIVE and SWARM headlessly on identical seed and returns KPI diff.
    - POST /api/planner/compare: Executes A* and Dijkstra on a given grid from start to goal,
      returning paths, costs, runtimes, and cell-by-cell exploration order.

Talks to:
    - app.core.simulator.Simulator: Instantiates temporary headless simulation engines.
    - app.planning.astar & dijkstra: Compares informed search against uniform-cost search.
    - app.db.models.SimRun: Automatically saves both comparison runs into the database.
    - frontend/app/compare/page.tsx: Powers the visual Compare page tables and Recharts charts.
"""

from __future__ import annotations
import random
import time
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import SimRun
from app.core.simulator import Simulator, SimConfig
from app.planning.astar import astar
from app.planning.dijkstra import dijkstra
from app.core.map_generator import get_preset
from app.db.models import Organization
from app.billing.entitlements import get_current_org, require_feature, check_and_consume_sim_run

router = APIRouter(tags=["compare"])


class CompareModesRequest(BaseModel):
    map_preset: str = Field(default="congested")
    num_robots: int = Field(default=10, ge=1, le=30)
    planner: Literal["astar", "dijkstra"] = "astar"
    heuristic: Literal["manhattan", "euclidean", "octile"] = "manhattan"
    connectivity: Literal[4, 8] = 4
    allocation: Literal["nearest", "hungarian"] = "nearest"
    task_rate: float = Field(default=0.4, ge=0.0, le=1.0)
    seed: Optional[int] = None
    max_ticks: int = Field(default=200, ge=10, le=1000)
    cells: Optional[list[list[int]]] = None


class PlannerCompareRequest(BaseModel):
    start_row: int
    start_col: int
    goal_row: int
    goal_col: int
    heuristic: Literal["manhattan", "euclidean", "octile"] = "manhattan"
    connectivity: Literal[4, 8] = 4
    map_preset: Optional[str] = None
    cells: Optional[list[list[int]]] = None


def _run_headless_sim(coordination: str, seed: int, req: CompareModesRequest, custom_grid=None) -> dict:
    sim = Simulator()
    cfg = SimConfig(
        num_robots=req.num_robots,
        planner=req.planner,
        heuristic=req.heuristic,
        connectivity=req.connectivity,
        coordination=coordination,
        allocation=req.allocation,
        task_rate=req.task_rate,
        seed=seed,
        map_preset=req.map_preset if not custom_grid else "custom",
    )
    if custom_grid:
        sim.set_custom_grid(custom_grid.clone(), robot_count=req.num_robots)
        sim.configure(cfg)
    else:
        sim.configure(cfg)
        sim.reset()

    timed_out = False
    t0 = time.perf_counter()
    for _ in range(req.max_ticks):
        sim._tick_once()
        # 15-second real-time safety cutoff per mode
        if time.perf_counter() - t0 > 15.0:
            timed_out = True
            break

    state = sim.get_state()
    return {
        "metrics": state["metrics"],
        "total_ticks": sim.tick,
        "event_log": sim.events_log[-100:],
        "timed_out": timed_out,
    }


@router.post("/api/compare/modes")
async def compare_modes(
    req: CompareModesRequest,
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
    _gate = Depends(require_feature("benchmarks_compare")),
):
    """
    Run the same configuration twice headless (once NAIVE, once SWARM)
    with the exact same seed, save both to DB, and return comparison.
    Supports built-in presets, 'current_simulator', and saved custom maps ('custom_{id}').
    """
    from app.core.simulator import simulator
    from app.core.grid import Grid
    from app.db.models import CustomMap

    custom_grid = None
    if req.cells:
        custom_grid = Grid(len(req.cells), len(req.cells[0]))
        custom_grid.from_list(req.cells)
    elif req.map_preset == "current_simulator":
        if simulator.grid:
            custom_grid = simulator.grid.clone()
    elif str(req.map_preset).startswith("custom_"):
        custom_id = int(str(req.map_preset).replace("custom_", ""))
        custom_map = db.query(CustomMap).filter(CustomMap.id == custom_id).first()
        if custom_map and custom_map.cells:
            custom_grid = Grid(custom_map.height, custom_map.width)
            custom_grid.from_list(custom_map.cells)

    seed = req.seed if req.seed is not None else random.randint(1, 999999)

    naive_res = _run_headless_sim("naive", seed, req, custom_grid=custom_grid)
    swarm_res = _run_headless_sim("swarm", seed, req, custom_grid=custom_grid)

    # Save NAIVE run
    naive_run = SimRun(
        map_preset=req.map_preset,
        coordination="naive",
        planner=req.planner,
        heuristic=req.heuristic,
        connectivity=req.connectivity,
        num_robots=req.num_robots,
        seed=seed,
        total_ticks=naive_res["total_ticks"],
        speed=1.0,
        task_rate=req.task_rate,
        metrics=naive_res["metrics"],
        event_log=naive_res["event_log"],
        notes=f"Headless Compare (NAIVE, seed={seed})",
    )
    naive_run.org_id = org.id
    check_and_consume_sim_run(org, db)
    db.add(naive_run)

    # Save SWARM run
    swarm_run = SimRun(
        map_preset=req.map_preset,
        coordination="swarm",
        planner=req.planner,
        heuristic=req.heuristic,
        connectivity=req.connectivity,
        num_robots=req.num_robots,
        seed=seed,
        total_ticks=swarm_res["total_ticks"],
        speed=1.0,
        task_rate=req.task_rate,
        metrics=swarm_res["metrics"],
        event_log=swarm_res["event_log"],
        notes=f"Headless Compare (SWARM, seed={seed})",
    )
    swarm_run.org_id = org.id
    db.add(swarm_run)
    db.commit()
    db.refresh(naive_run)
    db.refresh(swarm_run)

    return {
        "seed": seed,
        "map_preset": req.map_preset,
        "num_robots": req.num_robots,
        "max_ticks": req.max_ticks,
        "naive": {
            "run_id": naive_run.id,
            "metrics": naive_res["metrics"],
            "total_ticks": naive_res["total_ticks"],
            "timed_out": naive_res["timed_out"],
        },
        "swarm": {
            "run_id": swarm_run.id,
            "metrics": swarm_res["metrics"],
            "total_ticks": swarm_res["total_ticks"],
            "timed_out": swarm_res["timed_out"],
        },
    }


@router.post("/api/planner/compare")
@router.post("/api/map/compare-planners")
async def compare_planners_endpoint(req: PlannerCompareRequest, db: Session = Depends(get_db)):
    """
    Run both A* and Dijkstra on the requested grid map and return both PlanResults,
    including paths, costs, expanded nodes, and explored cells in order.
    Supports built-in presets, 'current_simulator', and saved custom maps ('custom_{id}').
    """
    from app.core.simulator import simulator
    from app.core.grid import Grid
    from app.db.models import CustomMap

    if req.cells:
        grid = Grid(len(req.cells), len(req.cells[0]))
        grid.from_list(req.cells)
    elif req.map_preset == "current_simulator":
        grid = simulator.grid.clone() if simulator.grid else get_preset("warehouse")
    elif req.map_preset and str(req.map_preset).startswith("custom_"):
        custom_id = int(str(req.map_preset).replace("custom_", ""))
        custom_map = db.query(CustomMap).filter(CustomMap.id == custom_id).first()
        if not custom_map:
            raise HTTPException(404, f"Custom map ID {custom_id} not found")
        grid = Grid(custom_map.height, custom_map.width)
        grid.from_list(custom_map.cells)
    elif req.map_preset:
        try:
            grid = get_preset(req.map_preset)
        except KeyError:
            raise HTTPException(400, f"Unknown map preset '{req.map_preset}'")
    else:
        grid = simulator.grid.clone() if simulator.grid else get_preset("warehouse")

    start = (req.start_row, req.start_col)
    goal = (req.goal_row, req.goal_col)

    # Auto-adjust if start or goal is out of bounds or on obstacle (e.g. switching between maps)
    if not grid.in_bounds(start[0], start[1]) or not grid.is_traversable(start[0], start[1]):
        free = [(r, c) for r in range(grid.height) for c in range(grid.width) if grid.is_traversable(r, c)]
        if free:
            start = free[0]
            req.start_row, req.start_col = start

    if not grid.in_bounds(goal[0], goal[1]) or not grid.is_traversable(goal[0], goal[1]) or goal == start:
        free_rev = [(r, c) for r in reversed(range(grid.height)) for c in reversed(range(grid.width)) if grid.is_traversable(r, c) and (r, c) != start]
        if free_rev:
            goal = free_rev[0]
            req.goal_row, req.goal_col = goal

    if not grid.in_bounds(start[0], start[1]) or not grid.in_bounds(goal[0], goal[1]):
        raise HTTPException(400, "Start or goal coordinates are out of grid bounds")
    if not grid.is_traversable(start[0], start[1]):
        raise HTTPException(400, f"Start cell ({start[0]}, {start[1]}) is on an obstacle")
    if not grid.is_traversable(goal[0], goal[1]):
        raise HTTPException(400, f"Goal cell ({goal[0]}, {goal[1]}) is on an obstacle")

    a_result = astar(grid, start, goal, heuristic=req.heuristic, connectivity=req.connectivity)
    d_result = dijkstra(grid, start, goal, connectivity=req.connectivity)

    def fmt(r, name):
        return {
            "planner": name,
            "success": r.success,
            "cost": round(r.cost, 3) if r.cost != float("inf") else -1,
            "expanded_nodes": r.expanded_nodes,
            "explored_cells": [[row, col] for row, col in r.explored_cells],
            "runtime_ms": round(r.runtime_ms, 3),
            "path": [[row, col] for row, col in r.path],
            "path_length": len(r.path),
        }

    return {
        "astar": fmt(a_result, "astar"),
        "dijkstra": fmt(d_result, "dijkstra"),
        "start": [req.start_row, req.start_col],
        "goal": [req.goal_row, req.goal_col],
        "grid": {
            "width": grid.width,
            "height": grid.height,
            "cells": grid.to_list(),
        },
    }
