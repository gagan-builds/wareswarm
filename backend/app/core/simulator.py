"""
simulator.py - Discrete-Time Simulation Engine & WebSocket Publisher.

Purpose:
    Manages the authoritative warehouse simulation loop, advancing time tick-by-tick,
    executing fleet movements in SWARM or NAIVE mode, and broadcasting state to WebSockets.

Role in the project:
    The central backend runtime. Controls the lifecycle of the grid, robots, tasks,
    and coordinator, and exposes playback controls (start, pause, resume, step, reset).

Key contents:
    - SimConfig: Configuration parameters (robots, seed, map preset, coordination mode, speed).
    - Simulator: Singleton simulation engine driving the world loop and WebSocket broadcasts.
    - _tick_once(): Advances simulation by one discrete tick in SWARM or NAIVE mode.
    - _state_snapshot(): Serializes full world state for WebSocket clients.

Talks to:
    - app.swarm.coordinator.SwarmCoordinator: Runs SWARM multi-agent coordination pipeline.
    - app.api.ws: Broadcasts state snapshots to connected frontend clients.
    - app.api.routes_sim: Controlled via REST API endpoints (/start, /pause, /reset, /step).
"""

from __future__ import annotations
import asyncio
import json
import math
import random
import time
from typing import Any, Callable, Literal

from app.core.grid import Grid, CellType
from app.core.robot import Robot, RobotState, ROBOT_COLORS
from app.core.task import Task, TaskStatus, TaskQueue
from app.core.metrics import MetricsCollector, MetricsSnapshot
from app.core.map_generator import get_preset, generate_random
from app.planning.astar import astar
from app.planning.dijkstra import dijkstra
from app.swarm.coordinator import SwarmCoordinator
from app.config import settings


# ---------------------------------------------------------------------------
# Simulation configuration (validated by Pydantic in the API layer)
# ---------------------------------------------------------------------------

class SimConfig:
    """All parameters that define one simulation run."""

    def __init__(
        self,
        num_robots: int = 5,
        planner: str = "astar",
        heuristic: str = "manhattan",
        connectivity: int = 4,
        coordination: str = "swarm",   # "swarm" | "naive"
        allocation: str = "nearest",   # "nearest" | "hungarian"
        task_rate: float = 0.3,
        seed: int | None = None,
        speed: float = 1.0,
        map_preset: str = "warehouse",
        grid_width: int = 30,
        grid_height: int = 20,
    ) -> None:
        self.num_robots = max(1, min(num_robots, settings.max_robots))
        self.planner = planner
        self.heuristic = heuristic
        self.connectivity = connectivity
        self.coordination = coordination
        self.allocation = allocation
        self.task_rate = task_rate
        self.seed = seed
        self.speed = speed
        self.map_preset = map_preset
        self.grid_width = min(grid_width, settings.max_grid_width)
        self.grid_height = min(grid_height, settings.max_grid_height)


# ---------------------------------------------------------------------------
# The simulation engine
# ---------------------------------------------------------------------------

class Simulator:
    """
    Singleton (per-process) tick-based simulation engine.

    Only one simulation runs at a time.  The frontend can reconfigure and
    reset via REST endpoints.
    """

    def __init__(self) -> None:
        self.config = SimConfig()
        self.grid: Grid = Grid(20, 30)
        self._custom_grid: Grid | None = None
        self.custom_map_name: str | None = None
        self.robots: list[Robot] = []
        self.task_queue = TaskQueue()
        self.metrics = MetricsCollector()
        self.coordinator: SwarmCoordinator | None = None
        self.tick: int = 0
        self.running: bool = False
        self.paused: bool = False
        self._task: asyncio.Task | None = None
        self._rng: random.Random = random.Random()
        self._broadcast_fn: Callable[[dict], Any] | None = None
        self.events_log: list[dict] = []
        self.run_id: int | None = None
        self._build_world()

    def set_broadcast(self, fn: Callable[[dict], Any]) -> None:
        """Register a coroutine that broadcasts a dict to all WS clients."""
        self._broadcast_fn = fn

    def set_custom_grid(self, grid: Grid, robot_count: int | None = None, name: str | None = None) -> None:
        """Set a user-designed custom map with custom dimensions and placement."""
        self._custom_grid = grid.clone()
        self.custom_map_name = name or "Custom Map"
        self.config.map_preset = "custom"
        self.config.grid_width = grid.width
        self.config.grid_height = grid.height
        charging = grid.find_cells(CellType.CHARGING)
        if charging:
            self.config.num_robots = len(charging) if robot_count is None else min(robot_count, len(charging))
        elif robot_count:
            self.config.num_robots = robot_count
        self.reset()

    # ------------------------------------------------------------------
    # Start / Stop / Control
    # ------------------------------------------------------------------

    def configure(self, cfg: SimConfig) -> None:
        """Apply new configuration (call before start or after reset)."""
        self.config = cfg

    def reset(self, preserve_grid: bool = False) -> None:
        """Stop simulation and reset to a clean state."""
        self.running = False
        self.paused = False
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = None
        self.tick = 0
        self.events_log = []
        self._build_world(preserve_grid=preserve_grid)

    def _build_world(self, preserve_grid: bool = False) -> None:
        """(Re-)initialise grid, robots, task queue, and coordinator."""
        cfg = self.config
        self._rng = random.Random(cfg.seed)

        # Grid
        if preserve_grid:
            if self._custom_grid is not None:
                self.grid = self._custom_grid.clone()
            elif self.grid is None or self.grid.width != cfg.grid_width or self.grid.height != cfg.grid_height:
                self.grid = get_preset(cfg.map_preset, cfg.grid_width, cfg.grid_height)
        elif cfg.map_preset == "random":
            self.grid = generate_random(
                cfg.grid_width, cfg.grid_height,
                obstacle_density=0.15, seed=cfg.seed,
            )
        elif cfg.map_preset == "custom":
            if self._custom_grid is not None:
                self.grid = self._custom_grid.clone()
            else:
                self.grid = get_preset("warehouse", cfg.grid_width, cfg.grid_height)
        else:
            self.grid = get_preset(cfg.map_preset, cfg.grid_width, cfg.grid_height)

        # Configure CHARGING ('C') start bays equal to num_robots and spawn robots there
        existing_charging = self.grid.find_cells(CellType.CHARGING)
        charging_positions: list[tuple[int, int]] = []
        if (cfg.map_preset == "custom" or preserve_grid) and existing_charging:
            num = min(cfg.num_robots, len(existing_charging))
            charging_positions = list(existing_charging[:num])
            if not preserve_grid:
                for r, c in existing_charging[num:]:
                    self.grid.set_cell(r, c, CellType.FREE)

        # Ensure all requested robots have a charging spot
        if len(charging_positions) < cfg.num_robots:
            needed = cfg.num_robots - len(charging_positions)
            already_set = set(charging_positions)
            row_0_free = [
                (0, c) for c in range(1, self.grid.width - 1)
                if self.grid.cell_type(0, c) == CellType.FREE and (0, c) not in already_set
            ]
            row_1_free = [
                (1, c) for c in range(1, self.grid.width - 1)
                if self.grid.cell_type(1, c) == CellType.FREE and (1, c) not in already_set
            ]
            all_free = [
                (r, c)
                for r in range(2, self.grid.height)
                for c in range(self.grid.width)
                if self.grid.cell_type(r, c) == CellType.FREE and (r, c) not in already_set
            ]
            candidates = row_0_free + row_1_free + all_free
            charging_positions.extend(candidates[:needed])

        for r, c in charging_positions:
            self.grid.set_cell(r, c, CellType.CHARGING)

        # Spawn all robots on their respective CHARGING ('C') start bays
        self.robots = []
        for i, (r, c) in enumerate(charging_positions):
            robot = Robot(
                robot_id=i + 1,
                row=r, col=c,
                color=ROBOT_COLORS[i % len(ROBOT_COLORS)],
            )
            self.robots.append(robot)

        # Tasks
        self.task_queue = TaskQueue()
        self.metrics = MetricsCollector()

        # Seed initial tasks so all robots can immediately begin operations from C
        if cfg.task_rate > 0:
            storage_cells = self.grid.find_cells(CellType.STORAGE)
            dropoff_cells = self.grid.find_cells(CellType.DROPOFF)
            if storage_cells and dropoff_cells:
                # Guarantee tasks for all pickup cells; prioritize user-placed or custom storage cells
                task_cells = list(reversed(storage_cells)) if (preserve_grid or cfg.map_preset == "custom") else storage_cells
                for pr, pc in task_cells:
                    dr, dc = self._rng.choice(dropoff_cells)
                    self.task_queue.create_task(pr, pc, dr, dc, self.tick)
                # If robots outnumber storage cells, generate additional random tasks up to num_robots
                while len(self.task_queue.get_pending()) < cfg.num_robots:
                    self._generate_random_task()
            else:
                for _ in range(cfg.num_robots):
                    self._generate_random_task()

        # Coordinator
        self.coordinator = SwarmCoordinator(
            grid=self.grid,
            robots=self.robots,
            task_queue=self.task_queue,
            metrics=self.metrics,
            planner=cfg.planner,
            heuristic=cfg.heuristic,
            connectivity=cfg.connectivity,
            allocation=cfg.allocation,
        )

    def start(self) -> None:
        """Start the simulation loop."""
        if self.running:
            if self.paused:
                self.paused = False
            return
        if not self.robots or self.grid is None:
            self._build_world(preserve_grid=True)
        self.running = True
        self.paused = False
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._loop())

    def pause(self) -> None:
        self.paused = True

    def resume(self) -> None:
        self.paused = False

    async def step(self) -> dict:
        """Advance exactly one tick and return the state snapshot."""
        self._tick_once()
        return self._state_snapshot()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def _loop(self) -> None:
        """Asyncio task: advance ticks at the configured speed."""
        try:
            while self.running:
                if self.paused:
                    await asyncio.sleep(0.05)
                    continue
                t0 = time.perf_counter()
                self._tick_once()
                state = self._state_snapshot()
                if self._broadcast_fn:
                    await self._broadcast_fn(state)
                # Sleep to maintain tick rate (speed multiplier)
                target_period = 1.0 / (settings.default_tick_rate_hz * self.config.speed)
                elapsed = time.perf_counter() - t0
                sleep_time = max(0.0, target_period - elapsed)
                await asyncio.sleep(sleep_time)
        except asyncio.CancelledError:
            pass

    # ------------------------------------------------------------------
    # Core tick logic
    # ------------------------------------------------------------------

    def _tick_once(self) -> None:
        """Advance the simulation by exactly one tick."""
        self.tick += 1
        cfg = self.config

        # Auto-generate tasks
        if self._rng.random() < cfg.task_rate:
            self._generate_random_task()

        tick_events: list[dict] = []

        if cfg.coordination == "swarm" and self.coordinator:
            # --- SWARM mode: coordinator handles everything ---
            tick_events = self.coordinator.tick(self.tick)

        else:
            # --- NAIVE mode: each robot moves independently ---
            tick_events = self._naive_tick()

        self.events_log.extend(tick_events)
        # Keep last 500 events
        if len(self.events_log) > 500:
            self.events_log = self.events_log[-500:]

    # ------------------------------------------------------------------
    # NAIVE mode
    # ------------------------------------------------------------------

    def _naive_tick(self) -> list[dict]:
        """
        Naive tick: robots follow their own A* paths with no coordination.

        Collisions are detected (but not prevented) and logged.
        """
        events: list[dict] = []
        cfg = self.config

        # Assign tasks to idle robots (no coordination in assignment either)
        idle = [r for r in self.robots if r.state == RobotState.IDLE]
        pending = self.task_queue.get_pending()
        for robot, task in zip(idle, pending):
            task.status = TaskStatus.ASSIGNED
            task.assigned_robot_id = robot.robot_id
            task.assigned_tick = self.tick
            robot.assign_task(task.task_id, self.tick)

        # Plan paths for assigned robots
        for robot in self.robots:
            if robot.state == RobotState.ASSIGNED:
                task = self.task_queue.get_by_id(robot.task_id)
                if task:
                    goal = (task.pickup_row, task.pickup_col)
                    result = self._run_planner_naive(robot, goal)
                    if result.success:
                        robot.set_path(result.path, goal)
                        robot.state = RobotState.MOVING_TO_PICKUP
                    else:
                        robot.state = RobotState.BLOCKED

        # Move all robots (no conflict checking)
        new_positions: dict[tuple[int, int], list[int]] = {}

        for robot in self.robots:
            if robot.state not in (
                RobotState.MOVING_TO_PICKUP,
                RobotState.MOVING_TO_DROPOFF,
                RobotState.CARRYING,
            ):
                continue

            if not robot.path:
                self._naive_handle_arrival(robot, events)
                continue

            robot.move_to_next()
            pos = (robot.row, robot.col)
            new_positions.setdefault(pos, []).append(robot.robot_id)

            if not robot.path:
                self._naive_handle_arrival(robot, events)

        # Detect collisions (multiple robots at same cell)
        for pos, robot_ids in new_positions.items():
            if len(robot_ids) > 1:
                self.metrics.record_collision()
                events.append({
                    "type": "collision",
                    "tick": self.tick,
                    "cell": list(pos),
                    "robots": robot_ids,
                })

        return events

    def _naive_handle_arrival(self, robot: Robot, events: list[dict]) -> None:
        task = self.task_queue.get_by_id(robot.task_id) if robot.task_id else None
        if not task:
            robot.state = RobotState.IDLE
            return

        if not robot.carrying_task:
            robot.carrying_task = True
            robot.state = RobotState.CARRYING
            task.status = TaskStatus.IN_FLIGHT
            goal = (task.dropoff_row, task.dropoff_col)
            result = self._run_planner_naive(robot, goal)
            if result.success:
                robot.set_path(result.path, goal)
                robot.state = RobotState.MOVING_TO_DROPOFF
        else:
            robot.carrying_task = False
            robot.state = RobotState.IDLE
            task.status = TaskStatus.DONE
            task.completed_tick = self.tick
            robot.tasks_done += 1
            ct = task.completion_time or 0
            self.metrics.record_task_completion(ct)
            robot.task_id = None
            robot.goal = None
            robot.path = []
            events.append({
                "type": "task_completed",
                "tick": self.tick,
                "robot_id": robot.robot_id,
                "task_id": task.task_id,
                "completion_time": ct,
            })

    def _run_planner_naive(self, robot: Robot, goal: tuple[int, int]):
        cfg = self.config
        start = (robot.row, robot.col)
        if cfg.planner == "dijkstra":
            return dijkstra(self.grid, start, goal, connectivity=cfg.connectivity)
        return astar(self.grid, start, goal, heuristic=cfg.heuristic, connectivity=cfg.connectivity)

    # ------------------------------------------------------------------
    # Task generation
    # ------------------------------------------------------------------

    def _generate_random_task(self) -> Task | None:
        storage = self.grid.find_cells(CellType.STORAGE)
        dropoff = self.grid.find_cells(CellType.DROPOFF)
        if not storage or not dropoff:
            return None
        pr, pc = self._rng.choice(storage)
        dr, dc = self._rng.choice(dropoff)
        return self.task_queue.create_task(pr, pc, dr, dc, self.tick)

    def add_task(self, pickup_row: int, pickup_col: int, dropoff_row: int, dropoff_col: int) -> Task:
        """Manually create a task (called from REST API)."""
        return self.task_queue.create_task(pickup_row, pickup_col, dropoff_row, dropoff_col, self.tick)

    def add_robot(self, row: int, col: int) -> Robot | None:
        """Add a new robot at position (row, col)."""
        if not self.grid.is_traversable(row, col):
            return None
        # Check not occupied
        for r in self.robots:
            if r.row == row and r.col == col:
                return None
        rid = max((r.robot_id for r in self.robots), default=0) + 1
        robot = Robot(
            robot_id=rid, row=row, col=col,
            color=ROBOT_COLORS[(rid - 1) % len(ROBOT_COLORS)],
        )
        self.robots.append(robot)
        if self.grid.cell_type(row, col) == CellType.FREE:
            self.grid.set_cell(row, col, CellType.CHARGING)
        if self.coordinator:
            # Update coordinator's robot list reference
            self.coordinator.robots = self.robots
        return robot

    def add_obstacle(self, row: int, col: int) -> bool:
        """
        Place a dynamic obstacle at (row, col).

        Triggers re-planning for any robot whose path passes through that cell.
        """
        if not self.grid.in_bounds(row, col):
            return False
        self.grid.set_cell(row, col, CellType.OBSTACLE)
        # Invalidate paths that pass through this cell
        for robot in self.robots:
            if (row, col) in robot.path or (row, col) == (robot.row, robot.col):
                robot.needs_replan = True
        return True

    def toggle_cell(self, row: int, col: int, cell_type: int) -> bool:
        """Toggle a cell type (from frontend map editor)."""
        if not self.grid.in_bounds(row, col):
            return False
        target_ct = CellType(cell_type)
        current_ct = self.grid.cell_type(row, col)
        if target_ct == CellType.FREE:
            new_ct = CellType.FREE
        elif current_ct == target_ct:
            new_ct = CellType.FREE
        else:
            new_ct = target_ct

        self.grid.set_cell(row, col, new_ct)
        # Keep custom grid copy updated with interactive changes
        self._custom_grid = self.grid.clone()

        if new_ct == CellType.OBSTACLE:
            for robot in self.robots:
                if (row, col) in robot.path:
                    robot.needs_replan = True
        elif new_ct == CellType.STORAGE:
            dropoffs = self.grid.find_cells(CellType.DROPOFF)
            if dropoffs:
                dr, dc = self._rng.choice(dropoffs)
                task = self.task_queue.create_task(row, col, dr, dc, self.tick, priority=True)
                self.events_log.append({
                    "type": "task_assigned",
                    "tick": self.tick,
                    "task_id": task.task_id,
                    "pickup": [row, col],
                    "dropoff": [dr, dc],
                    "status": "pending",
                })
        elif new_ct == CellType.DROPOFF:
            pickups = self.grid.find_cells(CellType.STORAGE)
            if pickups:
                pr, pc = self._rng.choice(pickups)
                task = self.task_queue.create_task(pr, pc, row, col, self.tick, priority=True)
                self.events_log.append({
                    "type": "task_assigned",
                    "tick": self.tick,
                    "task_id": task.task_id,
                    "pickup": [pr, pc],
                    "dropoff": [row, col],
                    "status": "pending",
                })
        return True

    # ------------------------------------------------------------------
    # State snapshot (sent over WebSocket)
    # ------------------------------------------------------------------

    def _state_snapshot(self) -> dict:
        pending = self.task_queue.get_pending()
        in_flight = [t for t in self.task_queue.get_all() if t.status.value == "in_flight"]
        metrics = self.metrics.snapshot(
            self.tick, self.robots, len(pending), len(in_flight)
        )
        return {
            "tick": self.tick,
            "running": self.running,
            "paused": self.paused,
            "coordination": self.config.coordination,
            "config": {
                "num_robots": self.config.num_robots,
                "planner": self.config.planner,
                "heuristic": self.config.heuristic,
                "connectivity": self.config.connectivity,
                "coordination": self.config.coordination,
                "allocation": self.config.allocation,
                "task_rate": self.config.task_rate,
                "seed": self.config.seed,
                "speed": self.config.speed,
                "map_preset": self.config.map_preset,
                "custom_map_name": self.custom_map_name,
                "grid_width": self.config.grid_width,
                "grid_height": self.config.grid_height,
            },
            "robots": [r.to_dict() for r in self.robots],
            "tasks": [t.to_dict() for t in self.task_queue.get_all()[-100:]],
            "obstacles": [
                [r, c]
                for r in range(self.grid.height)
                for c in range(self.grid.width)
                if self.grid.cell_type(r, c).value == 1
            ],
            "events": self.events_log[-20:],
            "metrics": metrics.to_dict(),
            "grid": {
                "width": self.grid.width,
                "height": self.grid.height,
                "cells": self.grid.to_list(),
            },
        }

    def get_state(self) -> dict:
        """Public accessor for REST snapshot."""
        return self._state_snapshot()


# Global singleton shared by API routers
simulator = Simulator()
