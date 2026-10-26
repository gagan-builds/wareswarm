"""
task_allocator.py - Multi-Robot Task Assignment Strategies.

Purpose:
    Assigns pending warehouse cargo transport tasks to idle robots using either
    greedy nearest-neighbor heuristic or optimal Hungarian bipartite matching.

Role in the project:
    Initial step in the swarm coordination cycle. Called every tick by SwarmCoordinator
    to dispatch available robots to incoming customer orders.

Key contents:
    - assign_nearest(): Greedy O(R * T) assignment pairing each task to the closest idle robot.
    - assign_hungarian(): Global O(R^3) optimal bipartite matching minimizing total fleet travel.
    - allocate_tasks(): Factory function dispatching between allocation strategies based on config.

Talks to:
    - app.core.robot.Robot: Reads robot current positions and idle states.
    - app.core.task.Task: Reads task pickup coordinates and status.
    - app.swarm.coordinator.SwarmCoordinator: Receives matched (robot, task) pairs.

Algorithm Details:
    - Idea: Solves the task-to-robot allocation problem. Nearest-robot greedily picks the
      minimum Manhattan distance robot for each task. Hungarian algorithm models fleet and
      tasks as a complete bipartite cost matrix and solves the global minimum-weight assignment.
    - Time Complexity: O(R * T) for greedy nearest; O(max(R, T)^3) for Hungarian algorithm.
    - Project Objective: Maximize fleet throughput and minimize idle transit travel distance.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.robot import Robot
    from app.core.task import Task


def assign_nearest(
    idle_robots: list["Robot"],
    pending_tasks: list["Task"],
) -> list[tuple["Robot", "Task"]]:
    """
    Greedy nearest-robot assignment.

    Each pending task is matched to the closest idle robot (Manhattan
    distance from robot to task pickup).  Robots already matched are
    excluded from subsequent assignments.

    Returns:
        List of (robot, task) pairs to assign.
    """
    assignments: list[tuple["Robot", "Task"]] = []
    available = list(idle_robots)

    for task in pending_tasks:
        if not available:
            break
        best_robot = min(
            available,
            key=lambda r: abs(r.row - task.pickup_row) + abs(r.col - task.pickup_col),
        )
        assignments.append((best_robot, task))
        available.remove(best_robot)

    return assignments


def assign_hungarian(
    idle_robots: list["Robot"],
    pending_tasks: list["Task"],
) -> list[tuple["Robot", "Task"]]:
    """
    Hungarian algorithm assignment via scipy.

    Builds a cost matrix (robot × task) where cost[i][j] = Manhattan
    distance from robot i to task j's pickup.  Falls back to nearest-robot
    if scipy is not installed.

    Returns:
        List of (robot, task) pairs to assign.
    """
    if not idle_robots or not pending_tasks:
        return []

    try:
        import numpy as np
        from scipy.optimize import linear_sum_assignment  # type: ignore[import]
    except ImportError:
        # scipy not available – fall back gracefully
        return assign_nearest(idle_robots, pending_tasks)

    n_robots = len(idle_robots)
    n_tasks = len(pending_tasks)
    size = max(n_robots, n_tasks)

    # Pad cost matrix to square with large sentinel cost
    BIG = 10_000
    cost = np.full((size, size), BIG, dtype=float)

    for i, robot in enumerate(idle_robots):
        for j, task in enumerate(pending_tasks):
            cost[i, j] = abs(robot.row - task.pickup_row) + abs(robot.col - task.pickup_col)

    row_ind, col_ind = linear_sum_assignment(cost)

    assignments: list[tuple["Robot", "Task"]] = []
    for ri, ci in zip(row_ind, col_ind):
        if ri < n_robots and ci < n_tasks and cost[ri, ci] < BIG:
            assignments.append((idle_robots[ri], pending_tasks[ci]))

    return assignments
