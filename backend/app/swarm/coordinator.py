"""
coordinator.py - Swarm Fleet Coordination Engine.

Purpose:
    Orchestrates collision-free multi-agent fleet movement every simulation tick by
    combining task allocation, priority ordering, space-time reservation, and deadlock breaking.

Role in the project:
    The brain of the SWARM coordination mode. Invoked by Simulator._tick_once() to execute
    the step-by-step coordination pipeline across all robots.

Key contents:
    - SwarmCoordinator: Main coordination class managing fleet state, reservations, and metrics.
    - tick(): Orchestrates the 7-phase coordination pipeline for one simulation tick.
    - _check_and_move(): Verifies vertex/edge safety before committing an individual robot move.
    - _handle_arrival(): Transitions robot from moving-to-pickup to carrying, or completes delivery.

Talks to:
    - app.core.simulator.Simulator: Called every tick during active simulation.
    - app.swarm.reservation_table.ReservationTable: Rebuilds space-time slots each tick.
    - app.swarm.priority: Orders robot dispatch by lexicographic priority.
    - app.swarm.deadlock: Resolves wait-for dependency cycles.
    - app.swarm.task_allocator: Matches pending orders to idle robots.
    - app.planning.space_time_astar & astar: Calculates collision-free routes.

Algorithm Details:
    - Idea: Centralized monitoring with priority-based space-time reservations. Robots are
      sorted by multi-attribute priority. Higher-priority robots book their path trajectories
      first into the reservation table; lower-priority robots route around these reservations
      using Space-Time A* or wait in place.
    - Time Complexity: O(R log R + R * Cost(STA*)) per tick, where R is the number of robots.
    - Project Objective: Core coordination layer achieving 0 collisions and 100% deadlock resolution.
"""

from __future__ import annotations
import random
from typing import TYPE_CHECKING

from app.core.grid import Grid, CellType
from app.core.robot import Robot, RobotState, ROBOT_COLORS
from app.core.task import Task, TaskStatus, TaskQueue
from app.core.metrics import MetricsCollector
from app.planning.astar import astar, PlanResult
from app.planning.dijkstra import dijkstra
from app.planning.space_time_astar import space_time_astar
from app.planning.replanner import replan
from app.swarm.reservation_table import ReservationTable
from app.swarm.priority import compute_priority
from app.swarm.deadlock import detect_and_resolve_deadlocks
from app.swarm.task_allocator import assign_nearest, assign_hungarian
from app.config import settings


class SwarmCoordinator:
    """
    Central swarm coordinator – runs in SWARM mode.

    Attributes:
        grid:             The warehouse grid (shared reference; mutated by
                          dynamic obstacle events).
        robots:           List of active robots.
        task_queue:       Task queue.
        metrics:          MetricsCollector updated by this coordinator.
        reservation:      Space-time reservation table.
        planner:          "astar" or "dijkstra".
        heuristic:        A* heuristic name.
        connectivity:     4 or 8.
        allocation:       "nearest" or "hungarian".
        events:           Per-tick event log (cleared each tick).
    """

    def __init__(
        self,
        grid: Grid,
        robots: list[Robot],
        task_queue: TaskQueue,
        metrics: MetricsCollector,
        planner: str = "astar",
        heuristic: str = "manhattan",
        connectivity: int = 4,
        allocation: str = "nearest",
    ) -> None:
        self.grid = grid
        self.robots = robots
        self.task_queue = task_queue
        self.metrics = metrics
        self.reservation = ReservationTable()
        self.planner = planner
        self.heuristic = heuristic
        self.connectivity = connectivity
        self.allocation = allocation
        self.events: list[dict] = []

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def tick(self, current_tick: int) -> list[dict]:
        """
        Execute one coordination tick.

        Returns the list of events generated this tick.
        """
        self.events = []

        # 1. Allocate pending tasks to idle robots
        self._allocate_tasks(current_tick)

        # 2. Plan / re-plan paths for robots that need it
        self._plan_paths(current_tick)

        # 3. Rebuild reservation table from all current paths
        self._rebuild_reservations(current_tick)

        # 4. Deadlock detection and resolution
        dl_events = detect_and_resolve_deadlocks(self.robots, self.grid, current_tick)
        for ev in dl_events:
            self.metrics.record_deadlock_detected()
            self.metrics.record_deadlock_resolved()
        self.events.extend(dl_events)

        # 5. Move robots in priority order
        self._execute_moves(current_tick)

        return self.events

    # ------------------------------------------------------------------
    # Task allocation
    # ------------------------------------------------------------------

    def _allocate_tasks(self, tick: int) -> None:
        idle = [r for r in self.robots if r.state == RobotState.IDLE]
        pending = self.task_queue.get_pending()
        if not idle or not pending:
            return

        if self.allocation == "hungarian":
            pairs = assign_hungarian(idle, pending)
        else:
            pairs = assign_nearest(idle, pending)

        for robot, task in pairs:
            task.status = TaskStatus.ASSIGNED
            task.assigned_robot_id = robot.robot_id
            task.assigned_tick = tick
            robot.assign_task(task.task_id, tick)
            self.events.append({
                "type": "task_assigned",
                "tick": tick,
                "robot_id": robot.robot_id,
                "task_id": task.task_id,
            })

    # ------------------------------------------------------------------
    # Path planning
    # ------------------------------------------------------------------

    def _plan_for_robot(self, robot: Robot, goal: tuple[int, int], tick: int) -> bool:
        """Plan a path for a robot.  Returns True on success."""
        result = self._run_planner(robot, goal)
        self.metrics.record_plan(result.expanded_nodes, result.runtime_ms)

        if result.success and result.path:
            robot.set_path(result.path, goal)
            self.reservation.release_robot(robot.robot_id)
            self.reservation.reserve_path(
                robot.robot_id, result.path, (robot.row, robot.col), tick
            )
            return True
        else:
            robot.replan_count += 1
            if robot.replan_count >= settings.max_replan_attempts:
                robot.state = RobotState.BLOCKED
                self.events.append({
                    "type": "robot_blocked",
                    "tick": tick,
                    "robot_id": robot.robot_id,
                })
            return False

    def _run_planner(self, robot: Robot, goal: tuple[int, int]) -> PlanResult:
        """Select and call the appropriate planner."""
        start = (robot.row, robot.col)
        # Avoid cells occupied by idle or blocked robots (except goal)
        stationary_obstacles = {
            (r.row, r.col)
            for r in self.robots
            if r.robot_id != robot.robot_id
            and r.state in (RobotState.IDLE, RobotState.BLOCKED)
            and (r.row, r.col) != goal
        }

        # In swarm mode, consult the space-time reservation table first
        vr = self.reservation.get_vertex_reservations()
        er = self.reservation.get_edge_reservations()
        if self.planner == "astar" and vr:
            st_res = space_time_astar(
                self.grid, start, goal,
                vertex_reservations=vr,
                edge_reservations=er,
                start_time=0,
                max_time=120,
                connectivity=self.connectivity,
            )
            if st_res.success and len(st_res.path) > 0:
                return st_res

        if stationary_obstacles:
            return replan(
                self.grid, start, goal,
                planner=self.planner,
                heuristic=self.heuristic,
                connectivity=self.connectivity,
                penalised_cells=stationary_obstacles,
            )

        if self.planner == "dijkstra":
            return dijkstra(self.grid, start, goal, connectivity=self.connectivity)
        else:
            return astar(
                self.grid, start, goal,
                heuristic=self.heuristic,
                connectivity=self.connectivity,
            )

    def _plan_paths(self, tick: int) -> None:
        for robot in self.robots:
            if robot.state == RobotState.ASSIGNED:
                task = self.task_queue.get_by_id(robot.task_id)
                if task:
                    goal = (task.pickup_row, task.pickup_col)
                    if self._plan_for_robot(robot, goal, tick):
                        robot.state = RobotState.MOVING_TO_PICKUP

            elif robot.needs_replan or (
                robot.state == RobotState.WAITING and
                robot.waiting_ticks >= settings.max_wait_ticks
            ):
                robot.needs_replan = False
                robot.state = RobotState.REPLANNING
                task = self.task_queue.get_by_id(robot.task_id)
                if task and robot.goal:
                    self.metrics.record_replan()
                    success = self._plan_for_robot(robot, robot.goal, tick)
                    if success:
                        robot.state = (
                            RobotState.MOVING_TO_PICKUP
                            if not robot.carrying_task else RobotState.MOVING_TO_DROPOFF
                        )
                        robot.waiting_ticks = 0
                        self.events.append({
                            "type": "replan",
                            "tick": tick,
                            "robot_id": robot.robot_id,
                        })

    # ------------------------------------------------------------------
    # Reservation rebuild
    # ------------------------------------------------------------------

    def _rebuild_reservations(self, tick: int) -> None:
        self.reservation.clear()
        for robot in self.robots:
            if robot.path:
                self.reservation.reserve_path(
                    robot.robot_id, robot.path, (robot.row, robot.col), tick
                )

    # ------------------------------------------------------------------
    # Move execution (SWARM mode – with conflict checking)
    # ------------------------------------------------------------------

    def _execute_moves(self, tick: int) -> None:
        # Sort robots highest-priority-first
        ordered = sorted(self.robots, key=compute_priority, reverse=True)

        # Track cells occupied this tick (after moves)
        occupied: dict[tuple[int, int], int] = {
            (r.row, r.col): r.robot_id
            for r in self.robots
        }

        for robot in ordered:
            if robot.state in (RobotState.IDLE, RobotState.DONE, RobotState.BLOCKED) and not robot.path:
                continue

            if not robot.path:
                # Robot has arrived at its current goal
                self._handle_arrival(robot, tick, occupied)
                continue

            next_r, next_c = robot.path[0]

            # --- Safety checks ---
            blocker_id = occupied.get((next_r, next_c))
            vertex_conflict = (
                blocker_id is not None and blocker_id != robot.robot_id
            )
            edge_conflict = self.reservation.has_edge_conflict(
                robot.row, robot.col, next_r, next_c, tick, robot.robot_id
            )

            if vertex_conflict or edge_conflict:
                conflict_type = "vertex" if vertex_conflict else "edge"
                # Collision prevention: block the move
                self.metrics.record_collision_prevented()

                # Smoother conflict resolution: if already waited 1 tick, try immediate detour
                resolved_by_detour = False
                if robot.waiting_ticks >= 1 and robot.goal:
                    detour = replan(
                        self.grid, (robot.row, robot.col), robot.goal,
                        planner=self.planner, heuristic=self.heuristic,
                        connectivity=self.connectivity,
                        penalised_cells={(next_r, next_c)},
                    )
                    if detour.success and detour.path and detour.path[0] != (next_r, next_c):
                        detour_next = detour.path[0]
                        detour_edge = self.reservation.has_edge_conflict(
                            robot.row, robot.col, detour_next[0], detour_next[1], tick, robot.robot_id
                        )
                        if detour_next not in occupied and not detour_edge:
                            robot.set_path(detour.path, robot.goal)
                            robot.waiting_ticks = 0
                            self.events.append({
                                "type": "replan",
                                "tick": tick,
                                "robot_id": robot.robot_id,
                                "reason": "conflict_detour",
                            })
                            # Execute step along clear detour immediately
                            old_pos = (robot.row, robot.col)
                            del occupied[old_pos]
                            robot.move_to_next()
                            new_pos = (robot.row, robot.col)
                            occupied[new_pos] = robot.robot_id
                            if robot.state in (RobotState.WAITING, RobotState.REPLANNING):
                                robot.state = (
                                    RobotState.CARRYING if robot.carrying_task
                                    else (RobotState.MOVING_TO_DROPOFF if robot.carrying_task else RobotState.MOVING_TO_PICKUP)
                                )
                            if not robot.path:
                                self._handle_arrival(robot, tick, occupied)
                            continue
                        else:
                            robot.set_path(detour.path, robot.goal)
                            robot.waiting_ticks = 0
                            resolved_by_detour = True
                            self.events.append({
                                "type": "replan",
                                "tick": tick,
                                "robot_id": robot.robot_id,
                                "reason": "conflict_detour",
                            })

                if not resolved_by_detour:
                    robot.state = RobotState.WAITING
                    robot.wait()
                    self.events.append({
                        "type": "conflict_resolved",
                        "tick": tick,
                        "robot_id": robot.robot_id,
                        "conflict": conflict_type,
                        "blocker": blocker_id,
                    })
                continue

            # --- Clear to move ---
            old_pos = (robot.row, robot.col)
            del occupied[old_pos]
            robot.move_to_next()
            new_pos = (robot.row, robot.col)
            occupied[new_pos] = robot.robot_id

            # Restore active motion state
            if robot.state in (RobotState.WAITING, RobotState.REPLANNING):
                robot.state = (
                    RobotState.CARRYING if robot.carrying_task
                    else (RobotState.MOVING_TO_DROPOFF if robot.carrying_task else RobotState.MOVING_TO_PICKUP)
                )

            # Check arrival after move
            if not robot.path:
                self._handle_arrival(robot, tick, occupied)

    def _handle_arrival(self, robot: Robot, tick: int, occupied: dict) -> None:
        """Called when a robot has reached the end of its current path."""
        task = self.task_queue.get_by_id(robot.task_id) if robot.task_id else None
        if not task:
            robot.state = RobotState.IDLE
            return

        if robot.state in (RobotState.MOVING_TO_PICKUP, RobotState.ASSIGNED) and not robot.carrying_task:
            # Arrived at pickup
            robot.carrying_task = True
            robot.state = RobotState.CARRYING
            task.status = TaskStatus.IN_FLIGHT
            goal = (task.dropoff_row, task.dropoff_col)
            if self._plan_for_robot(robot, goal, tick):
                robot.state = RobotState.MOVING_TO_DROPOFF
            self.events.append({
                "type": "pickup",
                "tick": tick,
                "robot_id": robot.robot_id,
                "task_id": task.task_id,
            })

        elif robot.state in (RobotState.MOVING_TO_DROPOFF, RobotState.CARRYING) and robot.carrying_task:
            # Arrived at dropoff
            robot.carrying_task = False
            robot.state = RobotState.IDLE
            task.status = TaskStatus.DONE
            task.completed_tick = tick
            robot.tasks_done += 1
            ct = task.completion_time or 0
            self.metrics.record_task_completion(ct)
            robot.task_id = None
            robot.goal = None
            robot.path = []
            self.events.append({
                "type": "task_completed",
                "tick": tick,
                "robot_id": robot.robot_id,
                "task_id": task.task_id,
                "completion_time": ct,
            })
