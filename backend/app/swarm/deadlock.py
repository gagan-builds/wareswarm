"""
deadlock.py - Deadlock Detection & Resolution via Wait-For Dependency Graphs.

Purpose:
    Identifies circular wait-for dependencies among robots and autonomously resolves
    deadlocks by pulling lower-priority robots into side bays or replanning.

Role in the project:
    Part of the swarm coordination layer. Executed every tick by the SwarmCoordinator
    to ensure the warehouse fleet never gridlocks under dense traffic.

Key contents:
    - build_wait_for_graph(): Maps each waiting robot to the robot occupying its next step.
    - find_cycles(): Performs 3-color DFS (WHITE/GRAY/BLACK) to detect dependency cycles.
    - resolve_cycle(): Resolves deadlocks by keeping highest-priority robot moving and
      directing lower-priority robots to pull over or replan.
    - find_pull_over_cell(): Finds an adjacent unoccupied cell where a robot can step aside.

Talks to:
    - app.core.robot.Robot: Reads robot current cells, next intended steps, and wait status.
    - app.swarm.priority: Uses priority scores to decide which robot yields right-of-way.
    - app.swarm.coordinator.SwarmCoordinator: Called each tick during coordination cycle.

Algorithm Details:
    - Idea: Models fleet dependencies as a directed wait-for graph: A → B if robot A
      wants to enter the cell currently held by robot B. A directed cycle (A → B → A
      or A → B → C → A) represents a permanent deadlock. DFS cycle detection locates
      the cycle; the lowest-priority agent yields by stepping into an adjacent pull-over bay.
    - Time Complexity: O(R + E) for DFS detection (R = robots, E = wait dependencies ≤ R);
      O(R log R) for priority sorting during resolution.
    - Project Objective: Complete deadlock elimination (100% resolved) and continuous flow.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.robot import Robot


def build_wait_for_graph(robots: list["Robot"]) -> dict[int, int]:
    """
    Build a wait-for graph as a dict: robot_id → robot_id_it_waits_for.

    A robot is considered waiting for another robot B if:
      - Its next planned cell (path[0]) is currently occupied by B.
    """
    from app.core.robot import RobotState

    # Map position → robot_id for quick lookup
    pos_to_robot: dict[tuple[int, int], int] = {
        (r.row, r.col): r.robot_id
        for r in robots
        if r.state not in (RobotState.IDLE, RobotState.DONE)
    }

    wait_for: dict[int, int] = {}
    for robot in robots:
        if robot.path and robot.state in (
            RobotState.WAITING,
            RobotState.MOVING_TO_PICKUP,
            RobotState.MOVING_TO_DROPOFF,
            RobotState.CARRYING,
            RobotState.REPLANNING,
        ):
            next_cell = robot.path[0]
            blocking_id = pos_to_robot.get(next_cell)
            if blocking_id is not None and blocking_id != robot.robot_id:
                wait_for[robot.robot_id] = blocking_id

    return wait_for


def find_cycles(wait_for: dict[int, int]) -> list[list[int]]:
    """
    Find all simple cycles in the wait-for graph using DFS.

    Returns a list of cycles; each cycle is a list of robot IDs.
    """
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[int, int] = {rid: WHITE for rid in wait_for}
    parent: dict[int, int | None] = {rid: None for rid in wait_for}
    cycles: list[list[int]] = []
    visited_cycles: set[frozenset] = set()

    def dfs(v: int) -> None:
        color[v] = GRAY
        neighbour = wait_for.get(v)
        if neighbour is not None:
            if neighbour not in color:
                color[neighbour] = WHITE
                parent[neighbour] = None
            if color[neighbour] == GRAY:
                # Found a cycle – trace back
                cycle = [neighbour]
                cur = v
                while cur != neighbour:
                    cycle.append(cur)
                    cur = parent.get(cur, neighbour)  # type: ignore[arg-type]
                cycle.reverse()
                key = frozenset(cycle)
                if key not in visited_cycles:
                    visited_cycles.add(key)
                    cycles.append(cycle)
            elif color[neighbour] == WHITE:
                parent[neighbour] = v
                dfs(neighbour)
        color[v] = BLACK

    for node in list(wait_for.keys()):
        if color.get(node, WHITE) == WHITE:
            dfs(node)

    return cycles


def detect_and_resolve_deadlocks(
    robots: list["Robot"],
    grid,
    tick: int,
) -> list[dict]:
    """
    Detect all deadlocks (cycles + multi-robot intersection contention) among *robots*
    and resolve them proactively.

    Returns a list of event dicts (one per deadlock resolved) for the
    simulator event log.
    """
    from app.core.robot import RobotState
    from app.swarm.priority import compute_priority
    from app.planning.replanner import replan

    wait_for = build_wait_for_graph(robots)
    cycles = find_cycles(wait_for)
    events: list[dict] = []

    robot_map: dict[int, "Robot"] = {r.robot_id: r for r in robots}
    visited_groups: set[frozenset] = {frozenset(c) for c in cycles}

    # Also detect bottleneck/intersection contention where robots have been waiting >= 2 ticks
    stuck_robots = [r for r in robots if r.waiting_ticks >= 2 and r.path]
    for r in stuck_robots:
        blocker_id = wait_for.get(r.robot_id)
        if blocker_id is not None and blocker_id in robot_map:
            group = frozenset([r.robot_id, blocker_id])
            if group not in visited_groups:
                visited_groups.add(group)
                cycles.append([r.robot_id, blocker_id])

    currently_occupied: set[tuple[int, int]] = {(r.row, r.col) for r in robots}

    for cycle in cycles:
        cycle_robots = [robot_map[rid] for rid in cycle if rid in robot_map]
        if not cycle_robots:
            continue

        # Sort by priority descending – highest priority proceeds
        cycle_robots.sort(key=compute_priority, reverse=True)
        leader = cycle_robots[0]
        blocked_robots = cycle_robots[1:]

        leader_pos = (leader.row, leader.col)
        contested_cell = leader.path[0] if leader.path else leader_pos

        for robot in blocked_robots:
            robot_pos = (robot.row, robot.col)
            resolved = False

            # Strategy A: Try immediate re-route around the bottleneck
            if robot.goal:
                detour = replan(
                    grid, robot_pos, robot.goal,
                    penalised_cells={leader_pos, contested_cell},
                )
                if detour.success and detour.path and detour.path[0] not in (leader_pos, contested_cell):
                    robot.set_path(detour.path, robot.goal)
                    robot.waiting_ticks = 0
                    robot.state = (
                        RobotState.MOVING_TO_PICKUP
                        if not robot.carrying_task else RobotState.MOVING_TO_DROPOFF
                    )
                    resolved = True

            # Strategy B: If no detour without bottleneck, pull over to any free adjacent cell
            if not resolved:
                pullover = None
                for nr, nc in grid.neighbours(robot.row, robot.col, 4):
                    if (nr, nc) not in currently_occupied and (nr, nc) != leader_pos and (nr, nc) != contested_cell:
                        pullover = (nr, nc)
                        break

                if pullover:
                    currently_occupied.add(pullover)
                    after_pullover = (
                        replan(grid, pullover, robot.goal, penalised_cells={leader_pos, contested_cell})
                        if robot.goal else None
                    )
                    if after_pullover and after_pullover.success and after_pullover.path:
                        robot.set_path([pullover] + after_pullover.path, robot.goal)
                    else:
                        robot.path = [pullover]
                        robot.needs_replan = True
                    robot.waiting_ticks = 0
                    robot.state = (
                        RobotState.MOVING_TO_PICKUP
                        if not robot.carrying_task else RobotState.MOVING_TO_DROPOFF
                    )
                    resolved = True

            if not resolved:
                robot.needs_replan = True
                robot.waiting_ticks = 0

        events.append({
            "type": "deadlock_resolved",
            "tick": tick,
            "cycle": [r.robot_id for r in cycle_robots],
            "leader": leader.robot_id,
            "unblocked": [r.robot_id for r in blocked_robots],
        })

    return events
