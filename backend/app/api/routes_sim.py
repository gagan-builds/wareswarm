"""

routes_sim.py - Simulation Lifecycle & Control REST API Endpoints.



Purpose:

    Exposes REST endpoints to configure, start, pause, resume, single-step,

    and reset the simulation engine, as well as manually injecting tasks, robots, and obstacles.



Role in the project:

    The primary control interface between the frontend control panel and the backend Simulator.



Key contents:

    - POST /api/sim/start: Starts simulation loop.

    - POST /api/sim/pause: Pauses without resetting ticks.

    - POST /api/sim/resume: Resumes paused run.

    - POST /api/sim/step: Advances simulation by exactly 1 tick.

    - POST /api/sim/reset: Halts simulation, clears events, and resets tick to 0.

    - GET & PUT /api/sim/config: Reads and applies fleet configuration parameters.

    - POST /api/sim/tasks, /robots, /obstacle, /cell: Interactive world modification.



Talks to:

    - app.core.simulator.Simulator: Dispatches operational commands to singleton simulator.

    - frontend/components/ControlPanel.tsx: Invoked by frontend UI control buttons.

"""



from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import Organization
from app.billing.entitlements import get_current_org, validate_sim_config, check_and_consume_sim_run

from pydantic import BaseModel, Field



from app.core.simulator import simulator, SimConfig



router = APIRouter(prefix="/api/sim", tags=["simulation"])





class SimConfigRequest(BaseModel):

    num_robots: int = Field(default=5, ge=1, le=30)

    planner: Literal["astar", "dijkstra", "space_time_astar"] = "astar"

    heuristic: Literal["manhattan", "euclidean", "octile"] = "manhattan"

    connectivity: Literal[4, 8] = 4

    coordination: Literal["swarm", "naive"] = "swarm"

    allocation: Literal["nearest", "hungarian"] = "nearest"

    task_rate: float = Field(default=0.3, ge=0.0, le=1.0)

    seed: Optional[int] = None

    speed: float = Field(default=1.0, ge=0.25, le=10.0)

    map_preset: str = "warehouse"

    grid_width: int = Field(default=30, ge=5, le=60)

    grid_height: int = Field(default=20, ge=5, le=40)

    preserve_grid: Optional[bool] = False

    cells: Optional[list[list[int]]] = None





class ResetRequest(BaseModel):

    preserve_grid: Optional[bool] = False





class TaskRequest(BaseModel):

    pickup_row: int

    pickup_col: int

    dropoff_row: int

    dropoff_col: int





class RobotRequest(BaseModel):

    row: int

    col: int





class ObstacleRequest(BaseModel):

    row: int

    col: int





class CellToggleRequest(BaseModel):

    row: int

    col: int

    cell_type: int = Field(default=1, ge=0, le=4)





async def _notify():

    """Broadcast current state over WebSocket immediately."""

    if simulator._broadcast_fn:

        try:

            await simulator._broadcast_fn(simulator.get_state())

        except Exception:

            pass





@router.post("/start")
async def start_sim(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):

    """Start (or restart) the simulation."""

    simulator.start()

    await _notify()

    return {"status": "started", "tick": simulator.tick}





@router.post("/pause")

async def pause_sim():

    simulator.pause()

    await _notify()

    return {"status": "paused"}





@router.post("/resume")

async def resume_sim():

    simulator.resume()

    await _notify()

    return {"status": "resumed"}





@router.post("/step")
async def step_sim(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):

    """Advance one tick (only when paused)."""

    state = await simulator.step()

    await _notify()

    return state





@router.post("/reset")

async def reset_sim(req: Optional[ResetRequest] = None):

    preserve = req.preserve_grid if req else False

    simulator.reset(preserve_grid=preserve)

    await _notify()

    return {"status": "reset", "tick": 0}





@router.get("/config")

async def get_config():

    """Return current simulation configuration (single source of truth)."""

    cfg = simulator.config

    return {

        "num_robots": cfg.num_robots,

        "planner": cfg.planner,

        "heuristic": cfg.heuristic,

        "connectivity": cfg.connectivity,

        "coordination": cfg.coordination,

        "allocation": cfg.allocation,

        "task_rate": cfg.task_rate,

        "seed": cfg.seed,

        "speed": cfg.speed,

        "map_preset": cfg.map_preset,

        "grid_width": cfg.grid_width,

        "grid_height": cfg.grid_height,

    }





@router.put("/config")
async def update_config(
    cfg: SimConfigRequest,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    validate_sim_config(cfg.model_dump(), org, db)

    """Update simulation configuration (reset is required to apply)."""

    dump = cfg.model_dump()

    preserve_grid = dump.pop("preserve_grid", False)

    cells = dump.pop("cells", None)

    new_cfg = SimConfig(**dump)

    preset_changed = (new_cfg.map_preset != simulator.config.map_preset)

    simulator.configure(new_cfg)



    if cells is not None:
        from app.core.grid import Grid
        g = Grid(len(cells), len(cells[0]))
        g.from_list(cells)
        simulator.grid = g
        simulator._custom_grid = g.clone()
        simulator.config.grid_height = len(cells)
        simulator.config.grid_width = len(cells[0])
        simulator.reset(preserve_grid=True)

    elif preserve_grid and not preset_changed:

        simulator.reset(preserve_grid=True)

    else:

        simulator.reset(preserve_grid=False)



    await _notify()

    return {"status": "configured", "config": cfg.model_dump()}





@router.get("/state")

async def get_state():

    """Return current simulation state snapshot."""

    return simulator.get_state()





@router.post("/tasks")

async def add_task(req: TaskRequest):

    """Manually create a task."""

    task = simulator.add_task(req.pickup_row, req.pickup_col, req.dropoff_row, req.dropoff_col)

    await _notify()

    return task.to_dict()





@router.post("/robots")

async def add_robot(req: RobotRequest):

    """Add a robot at the specified cell."""

    robot = simulator.add_robot(req.row, req.col)

    if not robot:

        raise HTTPException(400, "Cannot place robot at that cell")

    await _notify()

    return robot.to_dict()





@router.post("/obstacle")

async def add_obstacle(req: ObstacleRequest):

    """Place a dynamic obstacle during a running simulation."""

    ok = simulator.add_obstacle(req.row, req.col)

    if not ok:

        raise HTTPException(400, "Invalid cell")

    await _notify()

    return {"status": "obstacle_placed", "row": req.row, "col": req.col}





@router.post("/cell")

async def toggle_cell(req: CellToggleRequest):

    """Toggle a cell type (map editor)."""

    ok = simulator.toggle_cell(req.row, req.col, req.cell_type)

    if not ok:

        raise HTTPException(400, "Invalid cell coordinates")

    await _notify()

    return {"status": "ok", "row": req.row, "col": req.col, "cell_type": req.cell_type}





@router.get("/metrics/live")

async def live_metrics():

    """Return the current metrics snapshot."""

    state = simulator.get_state()

    return state.get("metrics", {})

