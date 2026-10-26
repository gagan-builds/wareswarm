"""
space_time_astar.py - Space-Time A* (STA*) Planner.

Purpose:
    Plans collision-free trajectories in a 3D space-time search graph (row, col, time),
    enabling robots to route around each other and wait in place when corridors are busy.

Role in the project:
    Core multi-agent coordination planner. When two robots have overlapping trajectories,
    the lower-priority robot uses STA* while treating the higher-priority robot's path
    in the reservation table as impassable space-time obstacles.

Key contents:
    - STANode: State node in the space-time search graph (r, c, t, g, f).
    - space_time_astar(): Search algorithm integrating vertex and edge reservation tables.

Talks to:
    - app.core.grid.Grid: Reads static warehouse obstacles and traversability.
    - app.swarm.reservation_table: Queries occupied cells and transitions at tick t.
    - app.swarm.coordinator: Called during collision deconfliction and priority rerouting.

Algorithm Details:
    - Idea: Extends A* states to (r, c, t). Evaluates both spatial movements and temporal
      "wait" actions (r, c, t+1) to let a higher-priority robot pass first. Prevents:
        1. Vertex conflict: Two robots occupying (r, c) at tick t.
        2. Edge (swap) conflict: Two robots swapping cells between tick t and t+1.
    - Time Complexity: O(H * W * T * log(H * W * T)), where H * W is grid area and T is max time horizon.
    - Project Objective: Primary collision avoidance mechanism for multi-robot swarm fleet.
"""

from __future__ import annotations
import heapq
import math
import time
from dataclasses import dataclass, field

from app.core.grid import Grid
from app.planning.astar import PlanResult, _edge_cost, heuristic_manhattan


# ---------------------------------------------------------------------------
# Reservation table (also defined in swarm/reservation_table.py, but we
# accept it as a dict here to keep this module self-contained for testing)
# ---------------------------------------------------------------------------

VertexReservation = set[tuple[int, int, int]]   # (row, col, t)
EdgeReservation   = set[tuple[int, int, int, int, int]]  # (r1,c1,r2,c2,t)


@dataclass
class STANode:
    """Node in the space-time search graph."""
    f: float
    g: float
    r: int
    c: int
    t: int
    came_from: tuple[int, int, int] | None = None  # (r, c, t)

    def __lt__(self, other: "STANode") -> bool:
        return self.f < other.f


def space_time_astar(
    grid: Grid,
    start: tuple[int, int],
    goal: tuple[int, int],
    vertex_reservations: VertexReservation | None = None,
    edge_reservations: EdgeReservation | None = None,
    start_time: int = 0,
    max_time: int = 200,
    connectivity: int = 4,
) -> PlanResult:
    """
    Space-Time A* that avoids reserved cells/edges.

    Args:
        grid:                 Warehouse grid.
        start:                (row, col) start position at *start_time*.
        goal:                 (row, col) goal position.
        vertex_reservations:  Set of (row, col, t) triples to treat as blocked.
        edge_reservations:    Set of (r1,c1,r2,c2,t) – the move from (r1,c1)
                              to (r2,c2) at time t is forbidden (swap conflict).
        start_time:           The simulation tick at which this robot starts moving.
        max_time:             Maximum time steps allowed in the search.
        connectivity:         4 or 8.

    Returns:
        PlanResult.  The path contains (row, col) steps; the caller must
        offset by start_time to obtain absolute ticks.
    """
    t0_wall = time.perf_counter()

    vr: VertexReservation = vertex_reservations or set()
    er: EdgeReservation = edge_reservations or set()

    sr, sc = start
    gr, gc = goal

    if start == goal:
        return PlanResult(path=[], cost=0.0, expanded_nodes=0,
                          runtime_ms=0.0, success=True, planner="space_time_astar")

    if not grid.is_traversable(sr, sc) or not grid.is_traversable(gr, gc):
        elapsed = (time.perf_counter() - t0_wall) * 1000
        return PlanResult(path=[], cost=0.0, expanded_nodes=0,
                          runtime_ms=elapsed, success=False, planner="space_time_astar")

    # Priority queue: (f, node)
    open_list: list[STANode] = []
    start_node = STANode(
        f=heuristic_manhattan(sr, sc, gr, gc),
        g=0.0,
        r=sr, c=sc, t=start_time,
        came_from=None,
    )
    heapq.heappush(open_list, start_node)

    # best_g[(r, c, t)] = best cost seen
    best_g: dict[tuple[int, int, int], float] = {(sr, sc, start_time): 0.0}

    # For path reconstruction: state → predecessor state
    came_from_map: dict[tuple[int, int, int], tuple[int, int, int] | None] = {
        (sr, sc, start_time): None
    }

    expanded = 0

    while open_list:
        node = heapq.heappop(open_list)
        r, c, t, g = node.r, node.c, node.t, node.g

        state = (r, c, t)
        if g > best_g.get(state, math.inf):
            continue

        expanded += 1

        if (r, c) == (gr, gc):
            # Reconstruct
            path: list[tuple[int, int]] = []
            cur: tuple[int, int, int] | None = state
            while cur is not None:
                cr, cc, ct = cur
                if (cr, cc) != (sr, sc) or ct != start_time:
                    path.append((cr, cc))
                cur = came_from_map.get(cur)
            path.reverse()
            elapsed = (time.perf_counter() - t0_wall) * 1000
            return PlanResult(
                path=path,
                cost=g,
                expanded_nodes=expanded,
                runtime_ms=elapsed,
                success=True,
                planner="space_time_astar",
            )

        if t >= start_time + max_time:
            continue

        nt = t + 1  # next time step

        # ----- Wait action (stay in place) -----
        if (r, c, nt) not in vr:
            new_g = g + 1.0  # waiting costs 1 tick
            ns = (r, c, nt)
            if new_g < best_g.get(ns, math.inf):
                best_g[ns] = new_g
                came_from_map[ns] = state
                f_new = new_g + heuristic_manhattan(r, c, gr, gc)
                heapq.heappush(open_list, STANode(f=f_new, g=new_g, r=r, c=c, t=nt))

        # ----- Move actions -----
        for nr, nc in grid.neighbours(r, c, connectivity):
            # Vertex conflict: destination is reserved at nt
            if (nr, nc, nt) in vr:
                continue
            # Edge/swap conflict: swapping with another robot
            if (nr, nc, r, c, t) in er:
                continue

            move_cost = _edge_cost(r, c, nr, nc, grid, (gr, gc))
            new_g = g + move_cost
            ns = (nr, nc, nt)
            if new_g < best_g.get(ns, math.inf):
                best_g[ns] = new_g
                came_from_map[ns] = state
                f_new = new_g + heuristic_manhattan(nr, nc, gr, gc)
                heapq.heappush(open_list, STANode(f=f_new, g=new_g, r=nr, c=nc, t=nt))

    elapsed = (time.perf_counter() - t0_wall) * 1000
    return PlanResult(path=[], cost=math.inf, expanded_nodes=expanded,
                      runtime_ms=elapsed, success=False, planner="space_time_astar")
