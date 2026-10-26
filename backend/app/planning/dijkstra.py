"""
dijkstra.py - Dijkstra's Algorithm (Baseline Planner).

Purpose:
    Computes the shortest path on the warehouse grid without heuristic guidance,
    expanding uniformly in all directions.

Role in the project:
    Serves as the baseline comparison planner against A*. Used in the Compare
    page and benchmark routes to prove that A* achieves identical path optimality
    while expanding significantly fewer grid nodes.

Key contents:
    - dijkstra(): Executes uniform-cost search on Grid from start to goal.

Talks to:
    - app.core.grid.Grid: Reads cell traversability and grid boundaries.
    - app.planning.astar.PlanResult: Returns unified path result and explored nodes.
    - app.planning.astar._edge_cost: Evaluates step transition costs.
    - app.api.routes_compare: Called by planner comparison endpoints.

Algorithm Details:
    - Idea: Equivalent to A* with heuristic h(n) = 0. Expands nodes strictly in
      non-decreasing order of cost-so-far g(n), exploring a radial circle of cells
      until the goal is popped from the priority queue.
    - Time Complexity: O((V + E) log V) with a binary min-heap, where V is reachable cells
      and E is traversable transitions.
    - Project Objective: Academic viva baseline demonstration proving informed heuristic
      efficiency over unguided search.
"""

from __future__ import annotations
import heapq
import math
import time
from typing import Literal

from app.core.grid import Grid
from app.planning.astar import PlanResult, _edge_cost


def dijkstra(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    connectivity: int = 4,
) -> PlanResult:
    """
    Run Dijkstra's algorithm on *grid* from *start* to *goal*.

    Args:
        grid:         The warehouse grid (read-only during planning).
        start:        (row, col) start cell.
        goal:         (row, col) goal cell.
        connectivity: 4 or 8 connected movement.

    Returns:
        PlanResult with path, cost, expanded_nodes, runtime_ms, success.
        Path format is identical to astar() for direct comparison.
    """
    t0 = time.perf_counter()

    sr, sc = start
    gr, gc = goal

    if start == goal:
        return PlanResult(path=[], cost=0.0, expanded_nodes=0,
                          runtime_ms=0.0, success=True, planner="dijkstra")

    if not grid.is_traversable(sr, sc) or not grid.is_traversable(gr, gc):
        elapsed = (time.perf_counter() - t0) * 1000
        return PlanResult(path=[], cost=0.0, expanded_nodes=0,
                          runtime_ms=elapsed, success=False, planner="dijkstra")

    # Open list: (g, row, col)  — no heuristic term
    open_list: list[tuple[float, int, int]] = []
    heapq.heappush(open_list, (0.0, sr, sc))

    g_cost: dict[tuple[int, int], float] = {(sr, sc): 0.0}
    came_from: dict[tuple[int, int], tuple[int, int] | None] = {(sr, sc): None}

    expanded = 0
    explored: list[tuple[int, int]] = []

    while open_list:
        g, r, c = heapq.heappop(open_list)

        if g > g_cost.get((r, c), math.inf):
            continue

        expanded += 1
        explored.append((r, c))

        if (r, c) == (gr, gc):
            path: list[tuple[int, int]] = []
            cur: tuple[int, int] | None = (gr, gc)
            while cur is not None and cur != (sr, sc):
                path.append(cur)
                cur = came_from[cur]
            path.reverse()
            elapsed = (time.perf_counter() - t0) * 1000
            return PlanResult(
                path=path,
                cost=g,
                expanded_nodes=expanded,
                explored_cells=explored,
                runtime_ms=elapsed,
                success=True,
                planner="dijkstra",
            )

        for nr, nc in grid.neighbours(r, c, connectivity):
            new_g = g + _edge_cost(r, c, nr, nc, grid, (gr, gc))
            if new_g < g_cost.get((nr, nc), math.inf):
                g_cost[(nr, nc)] = new_g
                came_from[(nr, nc)] = (r, c)
                heapq.heappush(open_list, (new_g, nr, nc))

    elapsed = (time.perf_counter() - t0) * 1000
    return PlanResult(path=[], cost=math.inf, expanded_nodes=expanded,
                      explored_cells=explored,
                      runtime_ms=elapsed, success=False, planner="dijkstra")
