"""
routes_map.py - Warehouse Layout, Preset & Custom Map REST API Endpoints.

Purpose:
    Provides endpoints for retrieving current map cells, listing/applying presets,
    and creating, saving, loading, and deleting user-customized warehouse maps.

Role in the project:
    The map persistence and management API bridge connecting the Map Builder and
    Simulator to the backend database and simulation engine.

Key contents:
    - GET & PUT /api/map: Reads or updates raw cell matrices on active grid.
    - GET /api/map/presets & /presets/{name}: Lists and previews built-in warehouse layouts.
    - POST /api/map/preset/{name}/apply: Instantly switches the simulator to a preset.
    - GET, POST, DELETE /api/map/custom: CRUD operations for saved custom map designs.
    - POST /api/map/custom/apply: Loads a custom map directly into the running simulator.

Talks to:
    - app.core.map_generator: Loads preset matrices.
    - app.core.simulator.Simulator: Sets active grid and custom map properties.
    - app.db.models.CustomMap: Queries and stores custom layouts in database.
    - frontend/app/builder/page.tsx: Map Builder client interface.
"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.core.map_generator import PRESETS, get_preset, generate_random
from app.core.grid import CellType, Grid
from app.core.simulator import simulator
from app.db.session import get_db
from app.db.models import CustomMap, Organization
from app.billing.entitlements import get_current_org, get_entitlements, raise_plan_limit

router = APIRouter(prefix="/api/map", tags=["map"])


class MapDataRequest(BaseModel):
    cells: list[list[int]]
    width: int
    height: int


class CustomMapSaveRequest(BaseModel):
    name: str
    cells: list[list[int]]
    width: int = 30
    height: int = 20
    robot_count: Optional[int] = None
    description: Optional[str] = None


class ApplyCustomMapRequest(BaseModel):
    cells: list[list[int]]
    width: int = 30
    height: int = 20
    name: Optional[str] = "Custom Map"
    robot_count: Optional[int] = None


class PlannerCompareRequest(BaseModel):
    start_row: int
    start_col: int
    goal_row: int
    goal_col: int
    heuristic: str = "manhattan"
    connectivity: int = 4



@router.get("")
async def get_map():
    """Return current grid as a nested list."""
    return {
        "width": simulator.grid.width,
        "height": simulator.grid.height,
        "cells": simulator.grid.to_list(),
    }


@router.put("")
async def set_map(req: MapDataRequest):
    """Replace the current map with provided cell data."""
    from app.core.grid import Grid
    g = Grid(req.height, req.width)
    g.from_list(req.cells)
    simulator.grid = g
    if simulator.coordinator:
        simulator.coordinator.grid = g
    return {"status": "map_updated"}


@router.get("/presets")
async def list_presets():
    """List available preset layout names."""
    return {"presets": list(PRESETS.keys())}


@router.get("/presets/{name}")
async def get_preset_map(name: str, width: int = 30, height: int = 20, db: Session = Depends(get_db)):
    """Return a preset or custom map without applying it."""
    from app.core.simulator import simulator
    if name == "current_simulator":
        if simulator.grid:
            return {"width": simulator.grid.width, "height": simulator.grid.height, "cells": simulator.grid.to_list()}
    elif name.startswith("custom_"):
        try:
            cid = int(name.replace("custom_", ""))
            cm = db.query(CustomMap).filter(CustomMap.id == cid).first()
            if cm:
                return {"width": cm.width, "height": cm.height, "cells": cm.cells}
        except Exception:
            pass
    try:
        grid = get_preset(name, width, height)
        return {"width": grid.width, "height": grid.height, "cells": grid.to_list()}
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.post("/preset/{name}/apply")
async def apply_preset_map(name: str):
    """Switch the simulator to a preset map immediately and reset."""
    if name not in PRESETS:
        raise HTTPException(400, f"Unknown preset '{name}'. Available: {list(PRESETS.keys())}")
    simulator.config.map_preset = name
    simulator.custom_map_name = None
    simulator.reset()
    state = simulator.get_state()
    if simulator._broadcast_fn:
        await simulator._broadcast_fn(state)
    return {"status": "preset_applied", "preset": name, "state": state}


# ---------------------------------------------------------------------------
# Custom Map Creator / Customizer Endpoints
# ---------------------------------------------------------------------------

@router.get("/custom")
async def list_custom_maps(db: Session = Depends(get_db)):
    """List all user-saved custom maps."""
    maps = db.query(CustomMap).order_by(CustomMap.created_at.desc()).all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "width": m.width,
            "height": m.height,
            "robot_count": m.robot_count,
            "description": m.description,
        }
        for m in maps
    ]


@router.post("/custom")
async def save_custom_map(
    req: CustomMapSaveRequest,
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
):
    """Save or update a custom map in the library."""
    existing = db.query(CustomMap).filter(CustomMap.name == req.name, CustomMap.org_id == org.id).first()
    if existing:
        existing.cells = req.cells
        existing.width = req.width
        existing.height = req.height
        existing.robot_count = req.robot_count or 5
        existing.description = req.description
        db.commit()
        db.refresh(existing)
        return {"status": "updated", "id": existing.id, "name": existing.name}
    
    ent = get_entitlements(org, db)
    max_maps = ent.get_limit("saved_maps", 1)
    if max_maps != -1:
        current_count = db.query(CustomMap).filter(CustomMap.org_id == org.id, CustomMap.is_scenario == False).count()
        if current_count >= max_maps:
            raise_plan_limit("saved_maps", current_count, max_maps, "pro")

    new_map = CustomMap(
        org_id=org.id,
        name=req.name,
        width=req.width,
        height=req.height,
        cells=req.cells,
        robot_count=req.robot_count or 5,
        description=req.description,
    )
    db.add(new_map)
    db.commit()
    db.refresh(new_map)
    return {"status": "created", "id": new_map.id, "name": new_map.name}


@router.get("/custom/{map_id}")
async def get_custom_map(map_id: int, db: Session = Depends(get_db)):
    """Get full custom map with cell layout by ID."""
    m = db.query(CustomMap).filter(CustomMap.id == map_id).first()
    if not m:
        raise HTTPException(404, f"Custom map with ID {map_id} not found")
    return {
        "id": m.id,
        "name": m.name,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "width": m.width,
        "height": m.height,
        "cells": m.cells,
        "robot_count": m.robot_count,
        "description": m.description,
    }


@router.delete("/custom/{map_id}")
async def delete_custom_map(map_id: int, db: Session = Depends(get_db)):
    """Delete a custom map by ID."""
    m = db.query(CustomMap).filter(CustomMap.id == map_id).first()
    if not m:
        raise HTTPException(404, f"Custom map with ID {map_id} not found")
    db.delete(m)
    db.commit()
    return {"status": "deleted", "id": map_id}


@router.post("/custom/apply")
async def apply_custom_map_to_simulator(
    req: ApplyCustomMapRequest,
    db: Session = Depends(get_db),
    org: Organization = Depends(get_current_org),
):
    ent = get_entitlements(org, db)
    max_w = ent.get_limit("max_grid_width", 30)
    if max_w != -1 and req.width > max_w:
        raise_plan_limit("max_grid_width", req.width, max_w, "pro")
    max_h = ent.get_limit("max_grid_height", 20)
    if max_h != -1 and req.height > max_h:
        raise_plan_limit("max_grid_height", req.height, max_h, "pro")
    if req.robot_count:
        max_r = ent.get_limit("robots", 5)
        if max_r != -1 and req.robot_count > max_r:
            raise_plan_limit("robots", req.robot_count, max_r, "pro")
    """
    Load a custom user-designed map directly into the live simulator engine.
    Spawns robots on custom charging pads and configures tasks between custom stations.
    """
    g = Grid(req.height, req.width)
    g.from_list(req.cells)
    simulator.set_custom_grid(g, robot_count=req.robot_count, name=req.name)
    state = simulator.get_state()
    if simulator._broadcast_fn:
        await simulator._broadcast_fn(state)
    return {"status": "custom_map_applied", "name": req.name, "state": state}



@router.post("/obstacle")
async def add_dynamic_obstacle(row: int, col: int):
    """Drop a dynamic obstacle during a running simulation."""
    ok = simulator.add_obstacle(row, col)
    if not ok:
        raise HTTPException(400, "Cannot place obstacle there")
    return {"status": "ok", "row": row, "col": col}


@router.post("/compare-planners")
async def compare_planners(req: PlannerCompareRequest):
    """
    Run both A* and Dijkstra on the current map and return both PlanResults.
    """
    from app.planning.astar import astar
    from app.planning.dijkstra import dijkstra

    start = (req.start_row, req.start_col)
    goal = (req.goal_row, req.goal_col)
    grid = simulator.grid

    a_result = astar(grid, start, goal, heuristic=req.heuristic, connectivity=req.connectivity)
    d_result = dijkstra(grid, start, goal, connectivity=req.connectivity)

    def fmt(r, name):
        return {
            "planner": name,
            "success": r.success,
            "cost": r.cost,
            "expanded_nodes": r.expanded_nodes,
            "runtime_ms": r.runtime_ms,
            "path": [[row, col] for row, col in r.path],
            "path_length": len(r.path),
        }

    return {
        "astar": fmt(a_result, "astar"),
        "dijkstra": fmt(d_result, "dijkstra"),
        "start": [req.start_row, req.start_col],
        "goal": [req.goal_row, req.goal_col],
    }
