"""
robot.py - Autonomous Mobile Robot (AMR) State Machine & Data Container.

Purpose:
    Defines the robot agent model, its finite-state lifecycle, movement history,
    active cargo status, and serialization for WebSocket streaming.

Role in the project:
    Core agent entity in the simulation engine. Managed by the Simulator and SwarmCoordinator,
    with positions streamed live to the frontend HTML5 Canvas.

Key contents:
    - RobotState: StrEnum of operational states (IDLE, MOVING_TO_PICKUP, CARRYING, MOVING_TO_DROPOFF, WAITING, etc.).
    - Robot: Dataclass tracking position (row, col), remaining path, assigned task, wait ticks, and cargo status.
    - ROBOT_COLORS: Hex color palette for distinct frontend canvas rendering.

Talks to:
    - app.core.simulator.Simulator: Owns the fleet robot instances.
    - app.swarm.coordinator.SwarmCoordinator: Advances positions and updates states.
    - app.swarm.priority: Inspects robot properties to compute right-of-way score.
"""

from __future__ import annotations
from enum import Enum
from dataclasses import dataclass, field


class RobotState(str, Enum):
    IDLE               = "idle"
    ASSIGNED           = "assigned"
    MOVING_TO_PICKUP   = "moving_to_pickup"
    CARRYING           = "carrying"
    MOVING_TO_DROPOFF  = "moving_to_dropoff"
    WAITING            = "waiting"
    REPLANNING         = "replanning"
    BLOCKED            = "blocked"
    DONE               = "done"


# Colour palette (used by the frontend renderer)
ROBOT_COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
    "#F7DC6F", "#BB8FCE", "#85C1E9", "#82E0AA", "#F1948A",
    "#AED6F1", "#A9DFBF", "#FAD7A0", "#D2B4DE", "#A3E4D7",
    "#FDEBD0", "#D5DBDB", "#ABB2B9", "#F9E79F", "#A9CCE3",
    "#D7BDE2", "#A9DFBF", "#F5CBA7", "#AED6F1", "#A3E4D7",
    "#F1948A", "#FDFEFE", "#EAFAF1", "#EAF2F8", "#FDF2E9",
]


@dataclass
class Robot:
    """
    Robot data container and state machine.

    Attributes:
        robot_id:       Unique monotonic integer.
        row, col:       Current grid position.
        state:          Current RobotState.
        path:           Remaining planned path [(row,col), …] (next step first).
        task_id:        ID of the currently assigned task (or None).
        carrying_task:  True while carrying a load (between pickup and dropoff).
        goal:           Destination cell (pickup or dropoff).
        color:          Hex colour for the frontend.
        waiting_ticks:  Consecutive ticks spent WAITING (starvation counter).
        replan_count:   Number of re-plans for the current task.
        needs_replan:   Flag set by coordinator to trigger a re-plan.
        total_distance: Cumulative cells travelled.
        total_wait:     Cumulative ticks spent waiting.
        total_moving:   Cumulative ticks spent moving.
        tasks_done:     Number of completed tasks.
    """
    robot_id: int
    row: int
    col: int
    state: RobotState = RobotState.IDLE
    path: list[tuple[int, int]] = field(default_factory=list)
    task_id: int | None = None
    carrying_task: bool = False
    goal: tuple[int, int] | None = None
    color: str = "#FF6B6B"
    waiting_ticks: int = 0
    replan_count: int = 0
    needs_replan: bool = False
    # Metrics
    total_distance: float = 0.0
    total_wait: int = 0
    total_moving: int = 0
    tasks_done: int = 0
    start_task_tick: int | None = None

    def assign_task(self, task_id: int, tick: int) -> None:
        """Mark this robot as assigned to a task."""
        self.task_id = task_id
        self.state = RobotState.ASSIGNED
        self.replan_count = 0
        self.waiting_ticks = 0
        self.start_task_tick = tick

    def set_path(self, path: list[tuple[int, int]], goal: tuple[int, int]) -> None:
        """Update the robot's planned path and goal."""
        self.path = list(path)
        self.goal = goal

    def move_to_next(self) -> tuple[int, int]:
        """
        Advance one step along the path.  Returns the new (row, col).
        Caller is responsible for checking path is non-empty.
        """
        nr, nc = self.path.pop(0)
        import math
        dist = math.sqrt((nr - self.row) ** 2 + (nc - self.col) ** 2)
        self.total_distance += dist
        self.total_moving += 1
        self.row, self.col = nr, nc
        self.waiting_ticks = 0
        return nr, nc

    def wait(self) -> None:
        """Increment wait counters."""
        self.waiting_ticks += 1
        self.total_wait += 1

    def to_dict(self) -> dict:
        return {
            "id": self.robot_id,
            "x": self.col,
            "y": self.row,
            "row": self.row,
            "col": self.col,
            "state": self.state.value,
            "path": [[r, c] for r, c in self.path],
            "goal": list(self.goal) if self.goal else None,
            "carrying": self.carrying_task,
            "task_id": self.task_id,
            "color": self.color,
            "waiting_ticks": self.waiting_ticks,
            "replan_count": self.replan_count,
            "metrics": {
                "total_distance": round(self.total_distance, 2),
                "total_wait": self.total_wait,
                "total_moving": self.total_moving,
                "tasks_done": self.tasks_done,
            },
        }
