"""
metrics.py - Real-Time Simulation Metrics Collection & KPI Aggregation.

Purpose:
    Collects, aggregates, and computes live performance indicators (collisions,
    deadlocks, travel distances, waiting times, throughput, and fleet utilization).

Role in the project:
    Telemetry engine of WareSwarm. Updated every tick, broadcast to the frontend
    Key Metrics panel, and persisted to SQLite for run history and comparisons.

Key contents:
    - MetricsSnapshot: Immutable dataclass capturing all 18 simulation KPIs at tick t.
    - MetricsCollector: Stateful aggregator updated by the Simulator and SwarmCoordinator.

Talks to:
    - app.core.simulator.Simulator: Records collisions, distance, waiting ticks, and tick snapshots.
    - app.swarm.coordinator: Records collisions prevented and deadlocks resolved.
    - app.db.models.SimRun: Persists final metrics dictionary to the database.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.robot import Robot


@dataclass
class MetricsSnapshot:
    """Immutable snapshot of metrics at a given tick."""
    tick: int
    # Task metrics
    tasks_completed: int = 0
    tasks_pending: int = 0
    tasks_in_flight: int = 0
    throughput: float = 0.0          # tasks per 100 ticks
    avg_completion_time: float = 0.0
    # Collision / safety
    collision_count: int = 0
    collisions_prevented: int = 0
    # Deadlock
    deadlocks_detected: int = 0
    deadlocks_resolved: int = 0
    # Planning
    replan_count: int = 0
    avg_nodes_expanded: float = 0.0
    avg_planning_time_ms: float = 0.0
    # Fleet utilisation (%)
    utilisation_moving: float = 0.0
    utilisation_waiting: float = 0.0
    utilisation_idle: float = 0.0
    # Aggregate travel
    total_distance: float = 0.0
    total_wait_ticks: int = 0
    total_move_ticks: int = 0

    def to_dict(self) -> dict:
        return self.__dict__.copy()


class MetricsCollector:
    """Mutable metrics store updated by the simulator each tick."""

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.collision_count: int = 0
        self.collisions_prevented: int = 0
        self.deadlocks_detected: int = 0
        self.deadlocks_resolved: int = 0
        self.replan_count: int = 0
        self._completion_times: list[int] = []
        self._plan_nodes: list[int] = []
        self._plan_times: list[float] = []
        self.tasks_completed: int = 0

    def record_collision(self) -> None:
        self.collision_count += 1

    def record_collision_prevented(self) -> None:
        self.collisions_prevented += 1

    def record_deadlock_detected(self) -> None:
        self.deadlocks_detected += 1

    def record_deadlock_resolved(self) -> None:
        self.deadlocks_resolved += 1

    def record_replan(self) -> None:
        self.replan_count += 1

    def record_task_completion(self, completion_time: int) -> None:
        self.tasks_completed += 1
        self._completion_times.append(completion_time)

    def record_plan(self, nodes_expanded: int, runtime_ms: float) -> None:
        self._plan_nodes.append(nodes_expanded)
        self._plan_times.append(runtime_ms)

    def snapshot(self, tick: int, robots: list["Robot"], pending: int, in_flight: int) -> MetricsSnapshot:
        """Compute and return a MetricsSnapshot from current state."""
        from app.core.robot import RobotState

        total_ticks = sum(r.total_moving + r.total_wait for r in robots) or 1
        total_move = sum(r.total_moving for r in robots)
        total_wait = sum(r.total_wait for r in robots)
        total_idle = max(0, total_ticks - total_move - total_wait)

        return MetricsSnapshot(
            tick=tick,
            tasks_completed=self.tasks_completed,
            tasks_pending=pending,
            tasks_in_flight=in_flight,
            throughput=round(self.tasks_completed / max(tick, 1) * 100, 2),
            avg_completion_time=round(
                sum(self._completion_times) / len(self._completion_times), 2
            ) if self._completion_times else 0.0,
            collision_count=self.collision_count,
            collisions_prevented=self.collisions_prevented,
            deadlocks_detected=self.deadlocks_detected,
            deadlocks_resolved=self.deadlocks_resolved,
            replan_count=self.replan_count,
            avg_nodes_expanded=round(
                sum(self._plan_nodes) / len(self._plan_nodes), 1
            ) if self._plan_nodes else 0.0,
            avg_planning_time_ms=round(
                sum(self._plan_times) / len(self._plan_times), 3
            ) if self._plan_times else 0.0,
            utilisation_moving=round(total_move / total_ticks * 100, 1),
            utilisation_waiting=round(total_wait / total_ticks * 100, 1),
            utilisation_idle=round(total_idle / total_ticks * 100, 1),
            total_distance=round(sum(r.total_distance for r in robots), 2),
            total_wait_ticks=total_wait,
            total_move_ticks=total_move,
        )
