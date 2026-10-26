"""
replanner.py - Dynamic Path Re-planning Module.

Purpose:
    Generates alternative paths for robots whose current routes become blocked
    by dynamic obstacles, detected congestion, or deadlocks.

Role in the project:
    Part of the planning layer. Called by the simulator when a user places a dynamic
    obstacle on the canvas, or by the coordinator when conflict rerouting is required.

Key contents:
    - replan(): Recomputes routes with optional cell penalties or space-time reservations.

Talks to:
    - app.core.grid.Grid: Clones grid and applies temporary obstacle penalties.
    - app.planning.astar.astar: Standard 2D static re-planning.
    - app.planning.space_time_astar.space_time_astar: Multi-agent space-time re-planning.
    - app.swarm.coordinator: Calls replan when resolving deadlocks or priority conflicts.

Algorithm Details:
    - Idea: When a path is invalidated, temporarily marks trouble cells (such as stalled
      robots or newly dropped obstacles) as impassable on a cloned grid view, forcing the
      planner to find an alternate bypass without mutating the shared global map.
    - Time Complexity: O(A*) or O(STA*) depending on whether temporal reservations are supplied.
    - Project Objective: Dynamic environmental adaptation and live obstacle avoidance.
"""

from __future__ import annotations
from app.core.grid import Grid, CellType
from app.planning.astar import PlanResult, astar
from app.planning.space_time_astar import space_time_astar, VertexReservation, EdgeReservation


def replan(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    planner: str = "astar",
    heuristic: str = "manhattan",
    connectivity: int = 4,
    penalised_cells: set[tuple[int, int]] | None = None,
    vertex_reservations: VertexReservation | None = None,
    edge_reservations: EdgeReservation | None = None,
    start_time: int = 0,
) -> PlanResult:
    """
    Re-plan a path from *start* to *goal*, optionally penalising cells.

    Penalisation works by temporarily marking penalised cells as OBSTACLE
    in a cloned grid, so the planner routes around them.  The original grid
    is never mutated.

    Args:
        grid:              Warehouse grid (read-only).
        start:             Current robot position.
        goal:              Robot's destination.
        planner:           "astar", "dijkstra", or "space_time_astar".
        heuristic:         Heuristic name for A*.
        connectivity:      4 or 8.
        penalised_cells:   Cells to temporarily block for this plan.
        vertex_reservations: Passed to STA* only.
        edge_reservations:   Passed to STA* only.
        start_time:        Current tick (for STA*).

    Returns:
        PlanResult from the chosen planner.
    """
    working_grid = grid.clone()

    if penalised_cells:
        for r, c in penalised_cells:
            # Penalise cell unless it is the robot's current position or destination goal
            if working_grid.in_bounds(r, c) and (r, c) != start and (r, c) != goal:
                working_grid.set_cell(r, c, CellType.OBSTACLE)

    if planner == "space_time_astar":
        return space_time_astar(
            working_grid, start, goal,
            vertex_reservations=vertex_reservations,
            edge_reservations=edge_reservations,
            start_time=start_time,
            connectivity=connectivity,
        )
    elif planner == "dijkstra":
        from app.planning.dijkstra import dijkstra
        return dijkstra(working_grid, start, goal, connectivity=connectivity)
    else:
        return astar(working_grid, start, goal, heuristic=heuristic, connectivity=connectivity)
