"""
astar.py - A* Path Planner.

Purpose:
    Computes the shortest, obstacle-free route from a start cell to a goal cell
    on the warehouse 2D grid using informed heuristic search.

Role in the project:
    Primary single-agent path planner in WareSwarm. Called during task dispatch,
    initial route planning, baseline path comparisons, and NAIVE simulation mode.

Key contents:
    - PlanResult: Dataclass encapsulating paths, step counts, cost, runtime, and exploration order.
    - astar(): Main pathfinding function using a priority queue (min-heap).
    - heuristic_manhattan(), heuristic_euclidean(), heuristic_octile(): Admissible distance heuristics.
    - _edge_cost(): Computes step traversal cost and penalizes cutting through non-goal bays.

Talks to:
    - app.core.grid.Grid: Reads cell traversability, grid dimensions, and functional bay types.
    - app.swarm.coordinator.SwarmCoordinator: Uses astar for initial single-agent path generation.
    - app.api.routes_compare: Runs side-by-side benchmarking against Dijkstra.

Algorithm Details:
    - Idea: Informed best-first search. Prioritizes exploration of nodes with minimal
      f(n) = g(n) + h(n), where g(n) is the exact cost from start to n, and h(n) is an
      admissible heuristic estimate from n to goal that never overestimates true cost.
    - Time Complexity: O(b^d) worst-case; practically O(V log V) on 2D grids with an admissible heuristic.
    - Project Objective: Fast, optimal single-robot path generation and benchmarking
      efficiency gains against uninformed Dijkstra search.
"""

from __future__ import annotations
import heapq
import math
import time
from dataclasses import dataclass, field
from typing import Literal

from app.core.grid import Grid


# ---------------------------------------------------------------------------
# Shared result dataclass (same interface for every planner)
# ---------------------------------------------------------------------------

@dataclass
class PlanResult:
    """
    Unified result type returned by every planner.

    Attributes:
        path: List of (row, col) tuples from start (exclusive) to goal (inclusive).
              Empty list when success is False.
        cost: Path cost (Euclidean distance for 8-connected, hop count for 4-connected).
        expanded_nodes: Number of nodes popped from the open list.
        explored_cells: List of (row, col) tuples visited in expansion order.
        runtime_ms: Wall-clock time in milliseconds.
        success: True if a path was found.
        planner: Name of the planner that produced this result.
    """
    path: list[tuple[int, int]] = field(default_factory=list)
    cost: float = 0.0
    expanded_nodes: int = 0
    explored_cells: list[tuple[int, int]] = field(default_factory=list)
    runtime_ms: float = 0.0
    success: bool = False
    planner: str = "unknown"


# ---------------------------------------------------------------------------
# Heuristic functions
# ---------------------------------------------------------------------------

def heuristic_manhattan(r1: int, c1: int, r2: int, c2: int) -> float:
    """Manhattan distance – admissible for 4-connected movement."""
    return abs(r1 - r2) + abs(c1 - c2)


def heuristic_euclidean(r1: int, c1: int, r2: int, c2: int) -> float:
    """Euclidean distance – admissible for 8-connected movement."""
    return math.sqrt((r1 - r2) ** 2 + (c1 - c2) ** 2)


def heuristic_octile(r1: int, c1: int, r2: int, c2: int) -> float:
    """
    Octile distance – optimal heuristic for 8-connected movement on unit grids.
    Combines diagonal and cardinal moves: max(dr, dc) + (√2 - 1)*min(dr, dc).
    """
    dr, dc = abs(r1 - r2), abs(c1 - c2)
    return max(dr, dc) + (math.sqrt(2) - 1) * min(dr, dc)


_HEURISTICS = {
    "manhattan": heuristic_manhattan,
    "euclidean": heuristic_euclidean,
    "octile": heuristic_octile,
}


def _edge_cost(
    r1: int,
    c1: int,
    r2: int,
    c2: int,
    grid: Grid | None = None,
    goal: tuple[int, int] | None = None,
) -> float:
    """
    Return movement cost from (r1, c1) to (r2, c2).
    Cardinal: 1.0, Diagonal: √2.
    If grid and goal are provided:
      - Penalise non-goal functional cells (STORAGE, DROPOFF, CHARGING) by +3.0
        so robots use cross-aisles/highways instead of driving through dropoffs ('D')
        or shelf bays ('P').
      - Penalise non-goal bottom docking wall (r2 == grid.height - 1) to prevent
        skimming through dropoff station docks.
    """
    cost = math.sqrt(2) if (r1 != r2 and c1 != c2) else 1.0
    if grid is not None and goal is not None and (r2, c2) != goal:
        from app.core.grid import CellType
        ct = grid.cell_type(r2, c2)
        if ct in (CellType.STORAGE, CellType.DROPOFF, CellType.CHARGING):
            cost += 3.0
        elif (r2 == 0 or r2 == grid.height - 1) and ct == CellType.FREE:
            if grid.height > 3 and any(grid.cell_type(r2, c) in (CellType.DROPOFF, CellType.CHARGING) for c in range(grid.width)):
                cost += 1.0
    return cost


# ---------------------------------------------------------------------------
# A* algorithm
# ---------------------------------------------------------------------------

def astar(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    heuristic: Literal["manhattan", "euclidean", "octile"] = "manhattan",
    connectivity: int = 4,
) -> PlanResult:
    """
    Run A* on *grid* from *start* to *goal*.

    Args:
        grid:         The warehouse grid (read-only during planning).
        start:        (row, col) start cell.
        goal:         (row, col) goal cell.
        heuristic:    Name of the heuristic function.
        connectivity: 4 or 8 connected movement.

    Returns:
        PlanResult with path, cost, expanded_nodes, runtime_ms, success.
    """
    t0 = time.perf_counter()

    h_fn = _HEURISTICS.get(heuristic, heuristic_manhattan)
    sr, sc = start
    gr, gc = goal

    # Trivial case
    if start == goal:
        return PlanResult(path=[], cost=0.0, expanded_nodes=0,
                          runtime_ms=0.0, success=True, planner="astar")

    if not grid.is_traversable(sr, sc) or not grid.is_traversable(gr, gc):
        elapsed = (time.perf_counter() - t0) * 1000
        return PlanResult(path=[], cost=0.0, expanded_nodes=0,
                          runtime_ms=elapsed, success=False, planner="astar")

    # Open list: (f, g, row, col)
    open_list: list[tuple[float, float, int, int]] = []
    heapq.heappush(open_list, (h_fn(sr, sc, gr, gc), 0.0, sr, sc))

    # g_cost[node] = cheapest known cost from start
    g_cost: dict[tuple[int, int], float] = {(sr, sc): 0.0}

    # came_from[node] = predecessor for path reconstruction
    came_from: dict[tuple[int, int], tuple[int, int] | None] = {(sr, sc): None}

    expanded = 0
    explored: list[tuple[int, int]] = []

    while open_list:
        f, g, r, c = heapq.heappop(open_list)

        # Stale entry check
        if g > g_cost.get((r, c), math.inf):
            continue

        expanded += 1
        explored.append((r, c))

        if (r, c) == (gr, gc):
            # Reconstruct path (excluding start, including goal)
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
                planner="astar",
            )

        for nr, nc in grid.neighbours(r, c, connectivity):
            new_g = g + _edge_cost(r, c, nr, nc, grid, (gr, gc))
            if new_g < g_cost.get((nr, nc), math.inf):
                g_cost[(nr, nc)] = new_g
                came_from[(nr, nc)] = (r, c)
                f_new = new_g + h_fn(nr, nc, gr, gc)
                heapq.heappush(open_list, (f_new, new_g, nr, nc))

    elapsed = (time.perf_counter() - t0) * 1000
    return PlanResult(path=[], cost=math.inf, expanded_nodes=expanded,
                      explored_cells=explored,
                      runtime_ms=elapsed, success=False, planner="astar")
