"""
priority.py - Multi-Attribute Robot Priority Scheme.

Purpose:
    Computes a deterministic priority score for each robot to resolve right-of-way
    conflicts and prevent starvation in narrow warehouse aisles.

Role in the project:
    Part of the swarm coordination layer. Called every tick by SwarmCoordinator
    to rank robots before reserving space-time cells and breaking deadlocks.

Key contents:
    - compute_priority(): Returns lexicographic tuple ranking robot right-of-way.
    - sort_by_priority(): Sorts a fleet of robots from highest to lowest priority.

Talks to:
    - app.core.robot.Robot: Reads robot state, remaining path length, wait ticks, and ID.
    - app.swarm.coordinator.SwarmCoordinator: Uses priority order for reservations and movements.
    - app.swarm.deadlock.DeadlockDetector: Identifies lower-priority robot in wait cycles to pull over.

Algorithm Details:
    - Idea: Hierarchical lexicographic priority tuple:
        1. Cargo state: Carrying cargo > empty robot (delivery urgency).
        2. Proximity to goal: Fewer remaining steps > longer path (clears exits quickly).
        3. Anti-starvation: Longer waiting time > newly waiting (prevents indefinite stalling).
        4. Deterministic tie-break: Lower robot ID > higher robot ID.
    - Time Complexity: O(1) per robot score computation; O(N log N) to sort N robots.
    - Project Objective: Fair right-of-way conflict resolution and throughput maximization.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.robot import Robot


def compute_priority(robot: "Robot") -> tuple:
    """
    Return a tuple used for comparison (higher tuple = higher priority).

    Python tuple comparison is lexicographic, so the first element has the
    most weight.
    """
    from app.core.robot import RobotState
    is_carrying = int(robot.state == RobotState.CARRYING or
                      robot.state == RobotState.MOVING_TO_DROPOFF)
    distance_to_goal = len(robot.path) if robot.path else 9999
    # Negate distance so shorter distance = higher priority number
    return (
        is_carrying,            # 1 beats 0
        -distance_to_goal,      # -1 beats -100
        robot.waiting_ticks,    # more waiting = higher priority
        -robot.robot_id,        # lower ID wins tie
    )


def higher_priority(robot_a: "Robot", robot_b: "Robot") -> "Robot":
    """Return whichever robot has the higher priority score."""
    if compute_priority(robot_a) >= compute_priority(robot_b):
        return robot_a
    return robot_b
